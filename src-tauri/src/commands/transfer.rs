//! ファイル・ディレクトリのコピー・移動・削除を, 進捗の通知と中断に対応して実行するコマンド.
//!
//! 処理は別スレッドで実行し, 進捗は Tauri の [`Channel`](tauri::ipc::Channel) でフロントエンドへ送ります.
//! 中断は [`TransferState`] の中断フラグで受け付け, 大きなファイルはチャンクごとにフラグを確認します.

use super::ops::rename_noreplace;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// 進捗を通知する最短の間隔.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(50);

/// 1 回にコピーするバイト数 (中断を確認する間隔).
const CHUNK_SIZE: usize = 8 * 1024 * 1024;

/// 実行する操作の種類.
#[derive(Deserialize, Type, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TransferKind {
    /// コピー.
    Copy,
    /// 移動.
    Move,
    /// 削除.
    Delete,
}

/// コピー・移動・削除の依頼.
#[derive(Deserialize, Type, Debug)]
pub struct TransferRequest {
    /// 操作の種類.
    pub kind: TransferKind,
    /// 対象のパス.
    pub sources: Vec<String>,
    /// コピー・移動先のディレクトリ. 削除では使わない.
    pub dest_dir: Option<String>,
    /// true の場合, 同名のファイルを上書きする.
    #[serde(default)]
    pub overwrite: bool,
    /// true の場合, 削除でゴミ箱を使わず完全に削除する.
    #[serde(default)]
    pub permanent: bool,
    /// コピー時に指定した名前でコピーする (Copy のみ. 単一ファイルに限定).
    #[serde(default)]
    pub dest_name: Option<String>,
    /// コピー・移動しない対象の中のファイルのパス (同名のディレクトリを統合するとき, 上書きしないと
    /// 答えたもの). 移動では, 移動元に残る.
    #[serde(default)]
    pub skip: Vec<String>,
}

/// 同名のディレクトリを統合するときに, 中にある, 同名のファイル 1 件.
#[derive(Serialize, Type, Debug, PartialEq, Eq)]
pub struct NestedConflict {
    /// コピー・移動元のファイルの絶対パス (`TransferRequest::skip` に渡す値).
    pub source: String,
    /// 確認で表示する名前. 対象のディレクトリ名から始まる, 相対パス (例: `d/sub/a.txt`).
    pub label: String,
    /// 配置先のファイルのほうが, 更新日時が新しい (古いもので上書きすることになる).
    pub stale: bool,
}

/// 進捗の通知.
#[derive(Serialize, Type, Clone, Debug, PartialEq, Eq)]
pub struct TransferProgress {
    /// 処理済みの量. コピー・移動ではバイト数, 削除では件数.
    pub done: u64,
    /// 全体の量. 単位は `done` と同じ.
    pub total: u64,
    /// 処理中の項目の名前.
    pub current: String,
}

/// 操作の結果.
#[derive(Serialize, Type, Debug, PartialEq, Eq)]
pub struct TransferSummary {
    /// 最後まで処理した対象の数.
    pub processed: usize,
    /// 中断された場合は `true`.
    pub cancelled: bool,
}

/// 実行中の操作を中断するためのフラグを保持する状態.
#[derive(Default)]
pub struct TransferState {
    /// 中断が要求されたかどうか.
    cancel: Arc<AtomicBool>,
}

impl TransferState {
    /// 中断フラグを解除し, 操作の側から確認するためのフラグを返します.
    ///
    /// # Returns
    ///
    /// 中断フラグ.
    pub fn begin(&self) -> Arc<AtomicBool> {
        self.cancel.store(false, Ordering::SeqCst);
        Arc::clone(&self.cancel)
    }

    /// 実行中の操作へ, 中断を要求します.
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }
}

/// 処理を止める理由.
enum Stop {
    /// 中断が要求された.
    Cancelled,
    /// エラーが発生した.
    Failed(String),
}

impl From<std::io::Error> for Stop {
    fn from(e: std::io::Error) -> Self {
        Stop::Failed(e.to_string())
    }
}

/// 処理の進み具合と, 中断・通知の窓口.
struct Progress<'a> {
    /// 中断フラグ.
    cancel: &'a AtomicBool,
    /// コピー・移動しないファイルのパス.
    skip: &'a HashSet<PathBuf>,
    /// 進捗を通知する関数.
    on_progress: &'a mut dyn FnMut(TransferProgress),
    /// 処理済みの量.
    done: u64,
    /// 全体の量.
    total: u64,
    /// 最後に通知した時刻. まだ通知していない場合は `None`.
    last_sent: Option<Instant>,
}

impl Progress<'_> {
    /// 中断が要求されていれば [`Stop::Cancelled`] を返します.
    ///
    /// # Returns
    ///
    /// 中断が要求されていなければ [`Ok`]. 要求されていれば [`Stop::Cancelled`] の [`Err`].
    fn check(&self) -> Result<(), Stop> {
        if self.cancel.load(Ordering::SeqCst) {
            Err(Stop::Cancelled)
        } else {
            Ok(())
        }
    }

    /// 処理済みの量を加えて通知します.
    ///
    /// # Arguments
    ///
    /// * `amount` - 加える量 (コピー・移動はバイト数, 削除は件数).
    /// * `current` - 処理中の項目の名前.
    fn advance(&mut self, amount: u64, current: &str) {
        self.done += amount;
        // 通知が多すぎると IPC が詰まって遅くなるため, 一定時間ごとにまとめる (最初と最後は必ず通知する).
        let due = self
            .last_sent
            .is_none_or(|t| t.elapsed() >= PROGRESS_INTERVAL);
        if !due && self.done < self.total {
            return;
        }
        self.last_sent = Some(Instant::now());
        (self.on_progress)(TransferProgress {
            done: self.done,
            total: self.total,
            current: current.to_string(),
        });
    }
}

/// ファイルまたはディレクトリ以下の合計サイズ (バイト) を返します. 読めないものは 0 として数えます.
///
/// シンボリックリンクはリンク先をたどらず, リンク自身のサイズとして数えます (循環リンクによる無限ループを防ぐため).
///
/// # Arguments
///
/// * `path` - 対象のパス.
///
/// # Returns
///
/// 合計サイズ.
fn tree_size(path: &Path) -> u64 {
    let Ok(meta) = fs::symlink_metadata(path) else {
        return 0;
    };
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return meta.len();
    }
    fs::read_dir(path)
        .map(|entries| entries.flatten().map(|e| tree_size(&e.path())).sum::<u64>())
        .unwrap_or(0)
}

/// コピー先の隣に置く, 書き込み途中の一時ファイルのパスを返します.
///
/// # Arguments
///
/// * `dst` - コピー先のファイル.
///
/// # Returns
///
/// コピー先と同じディレクトリの, 隠しファイルの名前 (`.<名前>.rsfiler-<プロセス ID>.tmp`) のパス.
fn temp_path_of(dst: &Path) -> PathBuf {
    dst.with_file_name(format!(
        ".{}.rsfiler-{}.tmp",
        file_name_of(dst),
        std::process::id()
    ))
}

/// 1 つのファイルを, 進捗と中断を確認しながらコピーします.
///
/// 一時ファイルに書き込み, 書き終えてから名前の変更でコピー先に置き換えます. 途中で中断・失敗しても,
/// 既にあるコピー先は元のまま残り, 一時ファイルは消します. コピー先がハードリンクでも, リンク先の中身は
/// 書き換えません. 更新日時と権限も, コピー元に合わせます.
///
/// 上書きしない場合は, 置き換えるときにもコピー先が無いことを確かめます (確認の後に作られた同名の
/// ファイルを上書きしないため).
///
/// # Arguments
///
/// * `src` - コピー元のファイル.
/// * `dst` - コピー先のファイル.
/// * `overwrite` - true の場合, 既にあるコピー先を上書きする.
/// * `progress` - 進捗の窓口.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 中断・失敗した場合, 上書きしない場合にコピー先が既にあるときは [`Stop`].
fn copy_file(src: &Path, dst: &Path, overwrite: bool, progress: &mut Progress) -> Result<(), Stop> {
    let temp = temp_path_of(dst);
    let result = write_copy(src, &temp, progress).and_then(|()| place_temp(&temp, dst, overwrite));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

/// 書き終えた一時ファイルを, 名前の変更でコピー先に置きます.
///
/// # Arguments
///
/// * `temp` - 書き終えた一時ファイル.
/// * `dst` - コピー先のファイル.
/// * `overwrite` - true の場合, 既にあるコピー先を置き換える. false の場合は, 置き換えない.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 上書きしない場合にコピー先が既にあるとき, 失敗したときは [`Stop::Failed`].
fn place_temp(temp: &Path, dst: &Path, overwrite: bool) -> Result<(), Stop> {
    if overwrite {
        return fs::rename(temp, dst).map_err(Stop::from);
    }
    rename_noreplace(temp, dst).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            Stop::Failed(format!("Already exists: {}", dst.display()))
        } else {
            Stop::from(e)
        }
    })
}

/// コピー元の中身を, 進捗と中断を確認しながら書き込み, 更新日時と権限をコピー元に合わせます.
///
/// # Arguments
///
/// * `src` - コピー元のファイル.
/// * `dst` - 書き込むファイル (一時ファイル).
/// * `progress` - 進捗の窓口.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 中断・失敗した場合は [`Stop`].
fn write_copy(src: &Path, dst: &Path, progress: &mut Progress) -> Result<(), Stop> {
    let name = file_name_of(src);
    let mut reader = fs::File::open(src)?;
    let meta = reader.metadata()?;
    let mut writer = fs::File::create(dst)?;
    loop {
        progress.check()?;
        // OS が対応していれば, カーネル内でコピーされる (Linux の copy_file_range など).
        let n = std::io::copy(&mut (&mut reader).take(CHUNK_SIZE as u64), &mut writer)?;
        if n == 0 {
            // コピーした量が 0 バイトはファイル末尾.
            break;
        }
        progress.advance(n, &name);
    }
    // 更新日時と権限は, 失敗しても (対応していないファイルシステムなど) コピー自体は成功として扱う.
    if let Ok(modified) = meta.modified() {
        let _ = writer.set_modified(modified);
    }
    // 書き込み中のハンドルを閉じてから, 権限を変える (読み取り専用にすると, 書けなくなるため).
    drop(writer);
    let _ = fs::set_permissions(dst, meta.permissions());
    Ok(())
}

/// シンボリックリンクを複製します.
///
/// # Arguments
///
/// * `src` - コピー元のシンボリックリンク.
/// * `dst` - コピー先.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`].
#[cfg(unix)]
fn copy_symlink(src: &Path, dst: &Path) -> std::io::Result<()> {
    let target = fs::read_link(src)?;
    std::os::unix::fs::symlink(&target, dst)
}

/// シンボリックリンクを複製します.
///
/// # Arguments
///
/// * `src` - コピー元のシンボリックリンク.
/// * `dst` - コピー先.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`].
///
/// シンボリックリンクを作る権限が無い場合 (開発者モードでも管理者でもない場合), ファイルへのリンクは,
/// リンク先の内容をコピーします. ディレクトリへのリンクはエラーにします (たどると循環しうるため).
#[cfg(windows)]
fn copy_symlink(src: &Path, dst: &Path) -> std::io::Result<()> {
    use std::os::windows::fs::FileTypeExt;
    /// シンボリックリンクを作る権限が無い (`ERROR_PRIVILEGE_NOT_HELD`).
    const ERROR_PRIVILEGE_NOT_HELD: i32 = 1314;
    let target = fs::read_link(src)?;
    let is_dir = fs::symlink_metadata(src)?.file_type().is_symlink_dir();
    let created = if is_dir {
        std::os::windows::fs::symlink_dir(&target, dst)
    } else {
        std::os::windows::fs::symlink_file(&target, dst)
    };
    match created {
        Err(e) if !is_dir && e.raw_os_error() == Some(ERROR_PRIVILEGE_NOT_HELD) => {
            fs::copy(src, dst).map(|_| ())
        }
        other => other,
    }
}

/// ディレクトリでないもの (ファイル・シンボリックリンク) を消します.
///
/// # Arguments
///
/// * `path` - 対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`].
#[cfg(unix)]
fn remove_entry(path: &Path) -> std::io::Result<()> {
    fs::remove_file(path)
}

/// ディレクトリでないもの (ファイル・シンボリックリンク) を消します.
/// Windows のディレクトリへのシンボリックリンクは, `remove_dir` で消します.
///
/// # Arguments
///
/// * `path` - 対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`].
#[cfg(windows)]
fn remove_entry(path: &Path) -> std::io::Result<()> {
    use std::os::windows::fs::FileTypeExt;
    if fs::symlink_metadata(path)?.file_type().is_symlink_dir() {
        fs::remove_dir(path)
    } else {
        fs::remove_file(path)
    }
}

/// ファイルまたはディレクトリを再帰的にコピーします.
///
/// シンボリックリンクはリンク先をたどらず, リンクとして複製します (循環リンクによる無限ループを防ぐため).
///
/// # Arguments
///
/// * `src` - コピー元.
/// * `dst` - コピー先 (名前を含むパス). 既存のディレクトリには内容を統合します.
///   `progress` の `skip` に含まれるパスは, コピーせずに進捗だけ進めます.
/// * `overwrite` - true の場合, 既にあるファイル・リンクを上書きする. false の場合は, 上書きせずに失敗する.
/// * `progress` - 進捗の窓口.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 中断・失敗した場合は [`Stop`].
fn copy_tree(src: &Path, dst: &Path, overwrite: bool, progress: &mut Progress) -> Result<(), Stop> {
    if progress.skip.contains(src) {
        // 上書きしないと答えたファイル. 進捗だけ進める.
        progress.advance(tree_size(src), &file_name_of(src));
        return Ok(());
    }
    let meta = fs::symlink_metadata(src)?;
    if meta.file_type().is_symlink() {
        // 既にあるファイル・リンクは, 上書きする場合だけ置き換える. ディレクトリは, リンクで置き換えない
        // (中身を失うため)
        if let Ok(existing) = fs::symlink_metadata(dst) {
            if !overwrite {
                return Err(Stop::Failed(format!("Already exists: {}", dst.display())));
            }
            if existing.is_dir() {
                return Err(Stop::Failed(format!(
                    "Destination directory already exists: {}",
                    dst.display()
                )));
            }
            remove_entry(dst)?;
        }
        copy_symlink(src, dst)?;
        progress.advance(meta.len(), &file_name_of(src));
        Ok(())
    } else if meta.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            copy_tree(
                &entry.path(),
                &dst.join(entry.file_name()),
                overwrite,
                progress,
            )?;
        }
        Ok(())
    } else {
        copy_file(src, dst, overwrite, progress)
    }
}

/// パスの最後の名前を文字列で返します.
///
/// # Arguments
///
/// * `path` - 対象のパス.
///
/// # Returns
///
/// 最後の名前. 名前が無い場合 (ルートなど) は空の文字列.
fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// 対象のパスと, 配置先ディレクトリから, 配置先のパスを求めます.
///
/// # Arguments
///
/// * `src` - 対象のパス.
/// * `dest_dir` - 配置先のディレクトリ.
/// * `dest_name` - 配置先の名前. 指定がない場合は元の名前を使う.
///
/// # Returns
///
/// 配置先のパス. 名前を取れない場合 (`..` で終わるパスなど) は [`Err`].
fn destination_of(src: &Path, dest_dir: &Path, dest_name: Option<&str>) -> Result<PathBuf, String> {
    if let Some(name) = dest_name {
        Ok(dest_dir.join(name))
    } else {
        let name = src
            .file_name()
            .ok_or_else(|| format!("Invalid source path: {}", src.display()))?;
        Ok(dest_dir.join(name))
    }
}

/// 配置先ディレクトリ直下で, 既に存在する名前を返します.
///
/// # Arguments
///
/// * `sources` - 対象のパス.
/// * `dest_dir` - 配置先のディレクトリ.
/// * `dest_name` - 配置先の名前 (Copy のみ).
///
/// # Returns
///
/// 同名のエントリが既にある対象の名前. 名前を取れない対象は [`Err`].
pub fn find_conflicts(
    sources: &[String],
    dest_dir: &str,
    dest_name: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    for source in sources {
        let dest = destination_of(Path::new(source), Path::new(dest_dir), dest_name)?;
        if fs::symlink_metadata(&dest).is_ok() {
            names.push(file_name_of(&dest));
        }
    }
    Ok(names)
}

/// 配置先のファイルのほうが, 更新日時が新しいかを調べます (古いもので上書きすることになるかの判定).
///
/// 両方がファイル (ディレクトリでない) で, 更新日時を読めるときだけ true を返します.
/// 更新日時が同じ場合は false です.
///
/// # Arguments
///
/// * `src` - コピー・移動元のファイル.
/// * `dst` - 配置先の, 既にあるファイル.
///
/// # Returns
///
/// 配置先のほうが新しければ true.
fn is_newer_than_source(src: &Path, dst: &Path) -> bool {
    let modified = |p: &Path| {
        fs::symlink_metadata(p)
            .ok()
            .filter(|m| !m.is_dir())
            .and_then(|m| m.modified().ok())
    };
    match (modified(src), modified(dst)) {
        (Some(src_time), Some(dst_time)) => dst_time > src_time,
        _ => false,
    }
}

/// 配置先に同名のファイルがあり, 配置先のほうが更新日時が新しい対象を調べます.
///
/// # Arguments
///
/// * `sources` - 対象のパス.
/// * `dest_dir` - 配置先のディレクトリ.
/// * `dest_name` - 配置先の名前 (Copy のみ).
///
/// # Returns
///
/// 配置先のほうが新しい対象の名前. 名前を取れない対象は [`Err`].
pub fn find_stale_overwrites(
    sources: &[String],
    dest_dir: &str,
    dest_name: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    for source in sources {
        let src = Path::new(source);
        let dest = destination_of(src, Path::new(dest_dir), dest_name)?;
        if is_newer_than_source(src, &dest) {
            names.push(file_name_of(&dest));
        }
    }
    Ok(names)
}

/// 古いもので上書きすることになる対象 (配置先のほうが更新日時が新しい) を調べます (IPC コマンド).
///
/// # Arguments
///
/// * `sources` - 対象のパス.
/// * `dest_dir` - 配置先のディレクトリ.
/// * `dest_name` - 配置先の名前 (Copy のみ).
///
/// # Returns
///
/// 配置先のほうが新しい対象の名前. 失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command(async)]
#[specta::specta]
pub fn check_stale_overwrites(
    sources: Vec<String>,
    dest_dir: String,
    dest_name: Option<String>,
) -> Result<Vec<String>, String> {
    find_stale_overwrites(&sources, &dest_dir, dest_name.as_deref())
}

/// コピー・移動先に同名のエントリが既にあるかを調べます.
///
/// # Arguments
///
/// * `sources` - 対象のパス.
/// * `dest_dir` - 配置先のディレクトリ.
/// * `dest_name` - 配置先の名前 (Copy のみ).
///
/// # Returns
///
/// 同名のエントリが既にある対象の名前. 失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command(async)]
#[specta::specta]
pub fn check_conflicts(
    sources: Vec<String>,
    dest_dir: String,
    dest_name: Option<String>,
) -> Result<Vec<String>, String> {
    find_conflicts(&sources, &dest_dir, dest_name.as_deref())
}

/// 同名のディレクトリを統合するとき, 中にある同名のファイルを, 再帰的に集めます.
///
/// # Arguments
///
/// * `src` - 移動元 (コピー元) のディレクトリ.
/// * `dst` - 配置先の, 既にある同名のディレクトリ.
/// * `label` - `src` の表示名 (対象のディレクトリ名から始まる相対パス).
/// * `found` - 見つかった同名のファイルを足していく先.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. ディレクトリを読めない場合は [`Err`].
fn collect_nested_conflicts(
    src: &Path,
    dst: &Path,
    label: &str,
    found: &mut Vec<NestedConflict>,
) -> Result<(), String> {
    let mut entries: Vec<_> = fs::read_dir(src)
        .map_err(|e| format!("Failed to read {}: {}", src.display(), e))?
        .flatten()
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let child_src = entry.path();
        let child_dst = dst.join(entry.file_name());
        let child_label = format!("{}/{}", label, entry.file_name().to_string_lossy());
        let src_is_dir = entry.file_type().is_ok_and(|t| t.is_dir());
        match fs::symlink_metadata(&child_dst) {
            // 同名のものが無ければ, 上書きにならない.
            Err(_) => {}
            // ディレクトリ同士は, さらに中を調べる.
            Ok(meta) if src_is_dir && meta.is_dir() => {
                collect_nested_conflicts(&child_src, &child_dst, &child_label, found)?
            }
            // ファイル同士が, 上書きの対象.
            Ok(meta) if !src_is_dir && !meta.is_dir() => found.push(NestedConflict {
                source: child_src.to_string_lossy().into_owned(),
                label: child_label,
                stale: is_newer_than_source(&child_src, &child_dst),
            }),
            // ファイルとディレクトリの組み合わせは, 実行するときにエラーになる (ここでは数えない).
            Ok(_) => {}
        }
    }
    Ok(())
}

/// 同名のディレクトリを統合するとき, 中にある同名のファイルを調べます.
///
/// 対象がディレクトリで, 配置先に同名のディレクトリがある場合だけ, その中身を再帰的に比べます.
/// 上書きの確認 (1 件ずつ) に使います.
///
/// # Arguments
///
/// * `sources` - 対象のパス.
/// * `dest_dir` - 配置先のディレクトリ.
///
/// # Returns
///
/// 同名のファイルの一覧 (対象ごと, 名前順). 失敗した場合はエラー文字列を含む [`Err`].
pub fn find_nested_conflicts(
    sources: &[String],
    dest_dir: &str,
) -> Result<Vec<NestedConflict>, String> {
    let is_dir = |p: &Path| fs::symlink_metadata(p).is_ok_and(|m| m.is_dir());
    let mut found = Vec::new();
    for source in sources {
        let src = Path::new(source);
        let dst = destination_of(src, Path::new(dest_dir), None)?;
        if is_dir(src) && is_dir(&dst) {
            collect_nested_conflicts(src, &dst, &file_name_of(&dst), &mut found)?;
        }
    }
    Ok(found)
}

/// 同名のディレクトリを統合するとき, 中にある同名のファイルを調べます (IPC コマンド).
///
/// # Arguments
///
/// * `sources` - 対象のパス.
/// * `dest_dir` - 配置先のディレクトリ.
///
/// # Returns
///
/// 同名のファイルの一覧. 失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command(async)]
#[specta::specta]
pub fn check_nested_conflicts(
    sources: Vec<String>,
    dest_dir: String,
) -> Result<Vec<NestedConflict>, String> {
    find_nested_conflicts(&sources, &dest_dir)
}

/// シンボリックリンクをたどらずに, 正規化した絶対パスを返します.
///
/// 親ディレクトリだけを正規化して, 名前を付け直します. 対象がシンボリックリンクの場合は, リンク先ではなく
/// リンクそのもののパスになり, リンク先が無い (壊れた) リンクでも求められます.
///
/// # Arguments
///
/// * `path` - 対象のパス.
///
/// # Returns
///
/// 正規化したパス. 親ディレクトリを正規化できない場合はエラー文字列を含む [`Err`].
fn canonical_entry(path: &Path) -> Result<PathBuf, String> {
    let path = std::path::absolute(path).map_err(|e| e.to_string())?;
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) => fs::canonicalize(parent).map(|p| p.join(name)),
        // ルートや `..` で終わるパスには名前が無いので, そのまま正規化する.
        _ => fs::canonicalize(&path),
    }
    .map_err(|e| e.to_string())
}

/// コピー・移動の配置先を検証し, 対象ごとの配置先を返します.
///
/// # Arguments
///
/// * `request` - 依頼.
///
/// # Returns
///
/// (対象, 配置先) の組. 配置先が無い・ディレクトリでない・対象が存在しない・
/// 自分自身やその内側への配置・上書き不可の同名エントリがある場合は [`Err`].
fn plan_placements(request: &TransferRequest) -> Result<Vec<(PathBuf, PathBuf)>, String> {
    use crate::commands::ops::join_valid_name;

    let dest_dir = request
        .dest_dir
        .as_deref()
        .ok_or_else(|| "Destination directory is required".to_string())?;
    let dest_dir = Path::new(dest_dir);
    if !dest_dir.is_dir() {
        return Err(format!(
            "Destination is not a directory: {}",
            dest_dir.display()
        ));
    }

    // dest_name が指定されている場合, Copy のみ許可し, 単一ファイルに限定する.
    if request.dest_name.is_some() {
        if request.kind != TransferKind::Copy {
            return Err("dest_name is only allowed for Copy".to_string());
        }
        if request.sources.len() != 1 {
            return Err("dest_name requires exactly one source file".to_string());
        }
    }

    // シンボリックリンクをたどった実体のパスで比較するため, 正規化しておく.
    let dest_canonical = fs::canonicalize(dest_dir).map_err(|e| e.to_string())?;

    let mut plan = Vec::new();
    for source in &request.sources {
        let src = PathBuf::from(source);
        // シンボリックリンクは, リンク先ではなくリンクそのものを扱う (リンク先が無くてもよい).
        let Ok(src_meta) = fs::symlink_metadata(&src) else {
            return Err(format!("Path does not exist: {}", source));
        };
        let dst = if let Some(name) = &request.dest_name {
            join_valid_name(dest_dir.to_str().unwrap(), name)?
        } else {
            destination_of(&src, dest_dir, None)?
        };
        let src_canonical = canonical_entry(&src)?;

        // dest_name がある場合は, 同一ディレクトリ別名の配置を許可する.
        if request.dest_name.is_none() && src_canonical.parent() == Some(dest_canonical.as_path()) {
            // 配置先が対象自身の親, つまり同じディレクトリへの配置は無意味なので拒否する.
            return Err(format!(
                "Source and destination are the same: {}",
                src.display()
            ));
        }
        if src_meta.is_dir() && dest_canonical.starts_with(&src_canonical) {
            // 配置先が対象ディレクトリの内側 (自分自身を含む) にある場合は, 無限ループになるため拒否する.
            return Err(format!(
                "Cannot place a directory into itself: {}",
                src.display()
            ));
        }
        if !request.overwrite && fs::symlink_metadata(&dst).is_ok() {
            return Err(format!("Already exists: {}", dst.display()));
        }
        plan.push((src, dst));
    }
    Ok(plan)
}

/// 対象を, 移動先へ移します. 名前の変更で移せない場合 (別のディスクなど) は, コピーしてから元を消します.
///
/// 移動先に同名のエントリがあるときの扱い:
/// - 同名のディレクトリがあり, 移動元もディレクトリ: 中身を移動先へ統合します (同名のファイルは上書き).
///   移動元のディレクトリは, 空になったら消します.
/// - 同名のディレクトリがあり, 移動元がファイル: 失敗します (ディレクトリをファイルで置き換えない).
/// - 同名のファイルがある: `overwrite` が true なら消して置き換えます.
///
/// `overwrite` が false なのに同名のエントリがある場合は, 何も変えずに失敗します (呼び出し側の
/// 検証 (`plan_placements`) の後に, 同名のものができた場合に, 黙って上書きしないため).
///
/// # Arguments
///
/// * `src` - 移動元.
/// * `dst` - 移動先 (名前を含むパス).
/// * `overwrite` - true の場合, 同名のものを上書きする (ディレクトリは統合する).
/// * `renamer` - 名前の変更を行う関数.
/// * `progress` - 進捗の窓口.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 中断・失敗した場合は [`Stop`].
fn move_one(
    src: &Path,
    dst: &Path,
    overwrite: bool,
    renamer: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
    progress: &mut Progress,
) -> Result<(), Stop> {
    if progress.skip.contains(src) {
        // 上書きしないと答えたファイル. 移動元に残して, 進捗だけ進める.
        progress.advance(tree_size(src), &file_name_of(src));
        return Ok(());
    }
    if let Ok(meta) = fs::symlink_metadata(dst) {
        if !overwrite {
            return Err(Stop::Failed(format!("Already exists: {}", dst.display())));
        }
        if meta.is_dir() {
            let src_is_dir = fs::symlink_metadata(src)?.is_dir();
            if !src_is_dir {
                return Err(Stop::Failed(format!(
                    "Destination directory already exists: {}",
                    dst.display()
                )));
            }
            return merge_directory(src, dst, overwrite, renamer, progress);
        }
        remove_entry(dst)?;
    }
    let size = tree_size(src);
    match renamer(src, dst) {
        Ok(()) => {
            // 名前の変更で移せた (同一ディスク内). 進捗はサイズ分をまとめて進める.
            progress.advance(size, &file_name_of(src));
            return Ok(());
        }
        // 確認の後に, 同名のものが作られた. 上書きしない.
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            return Err(Stop::Failed(format!("Already exists: {}", dst.display())));
        }
        Err(_) => {}
    }
    // 名前の変更に失敗した場合 (別のディスクへの移動など) は, コピーしてから元を消す.
    copy_tree(src, dst, overwrite, progress)?;
    let is_dir = fs::symlink_metadata(src)
        .map(|m| m.is_dir())
        .unwrap_or(false);
    if is_dir {
        fs::remove_dir_all(src)?;
    } else {
        remove_entry(src)?;
    }
    Ok(())
}

/// 移動元のディレクトリの中身を, 既にある同名の移動先のディレクトリへ, 1 つずつ移して統合します.
///
/// 全て移せて空になったら, 移動元のディレクトリを消します (上書きしないと答えたファイルが残っていれば
/// 消しません). 途中で中断・失敗した場合は, それまでに移した分は戻さず, 残りは移動元に残ります.
///
/// # Arguments
///
/// * `src` - 移動元のディレクトリ.
/// * `dst` - 移動先の, 既にあるディレクトリ.
/// * `overwrite` - 同名のファイルを上書きするか (統合のときは true).
/// * `renamer` - 名前の変更を行う関数.
/// * `progress` - 進捗の窓口.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 中断・失敗した場合は [`Stop`].
fn merge_directory(
    src: &Path,
    dst: &Path,
    overwrite: bool,
    renamer: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
    progress: &mut Progress,
) -> Result<(), Stop> {
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        progress.check()?;
        move_one(
            &entry.path(),
            &dst.join(entry.file_name()),
            overwrite,
            renamer,
            progress,
        )?;
    }
    // 上書きしないと答えたファイルが残っている間は, 移動元のディレクトリを消さない.
    if fs::read_dir(src)?.next().is_none() {
        fs::remove_dir(src)?;
    }
    Ok(())
}

/// コピー・移動・削除を実行します. 名前の変更とゴミ箱への移動は, 渡された関数で行います.
///
/// # Arguments
///
/// * `request` - 依頼.
/// * `cancel` - 中断フラグ. true になると, 次の確認の時点で処理を止める.
/// * `renamer` - 名前を変更する関数 (移動で使う).
/// * `trasher` - ゴミ箱へ移動する関数 (完全削除でない削除で使う).
/// * `on_progress` - 進捗を通知する関数.
///
/// # Returns
///
/// 結果. 中断された場合は `cancelled` が true の [`Ok`]. 失敗した場合はエラー文字列を含む [`Err`].
pub fn transfer_with(
    request: &TransferRequest,
    cancel: &AtomicBool,
    renamer: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
    trasher: &dyn Fn(&Path) -> Result<(), String>,
    on_progress: &mut dyn FnMut(TransferProgress),
) -> Result<TransferSummary, String> {
    if request.sources.is_empty() {
        let message = "No targets".to_string();
        log::error!("{}", message);
        return Err(message);
    }
    log::info!("{:?} 開始: {} 件", request.kind, request.sources.len());
    let skip: HashSet<PathBuf> = request.skip.iter().map(PathBuf::from).collect();
    let mut processed = 0;
    // 削除は件数, コピー・移動はバイト数で進捗を数えるため, 種類ごとに全体量の求め方が異なる.
    // try_for_each は, 途中の要素が Err (中断・失敗) を返した時点でそこで止まり, 残りは処理しない.
    let result = match request.kind {
        TransferKind::Delete => {
            let mut progress = Progress {
                cancel,
                skip: &skip,
                on_progress,
                done: 0,
                total: request.sources.len() as u64,
                last_sent: None,
            };
            request.sources.iter().try_for_each(|source| {
                progress.check()?;
                delete_one(Path::new(source), request.permanent, trasher)?;
                processed += 1;
                progress.advance(1, &file_name_of(Path::new(source)));
                Ok(())
            })
        }
        kind => {
            // 配置先の検証をすべて済ませてから実行する (途中まで進めて後から失敗させない).
            let plan = plan_placements(request)?;
            let total = plan.iter().map(|(src, _)| tree_size(src)).sum();
            let mut progress = Progress {
                cancel,
                skip: &skip,
                on_progress,
                done: 0,
                total,
                last_sent: None,
            };
            plan.iter().try_for_each(|(src, dst)| {
                progress.check()?;
                if kind == TransferKind::Copy {
                    copy_tree(src, dst, request.overwrite, &mut progress)?;
                } else {
                    move_one(src, dst, request.overwrite, renamer, &mut progress)?;
                }
                processed += 1;
                Ok(())
            })
        }
    };
    // 中断は呼び出し側の想定内の結果として Ok で返し, それ以外の失敗だけをエラーにする.
    match result {
        Ok(()) => {
            log::info!("{:?} 完了: {} 件", request.kind, processed);
            Ok(TransferSummary {
                processed,
                cancelled: false,
            })
        }
        Err(Stop::Cancelled) => {
            log::info!("{:?} 中断: {} 件処理済み", request.kind, processed);
            Ok(TransferSummary {
                processed,
                cancelled: true,
            })
        }
        Err(Stop::Failed(message)) => {
            log::error!("{:?} 失敗: {}", request.kind, message);
            Err(message)
        }
    }
}

/// 1 つの対象を削除します.
///
/// # Arguments
///
/// * `path` - 削除する対象.
/// * `permanent` - true の場合は完全に削除し, false の場合は `trasher` に任せる.
/// * `trasher` - ゴミ箱へ移動する関数.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 対象が存在しない場合や失敗した場合は [`Stop::Failed`].
fn delete_one(
    path: &Path,
    permanent: bool,
    trasher: &dyn Fn(&Path) -> Result<(), String>,
) -> Result<(), Stop> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| Stop::Failed(format!("Path does not exist: {}", path.display())))?;
    if !permanent {
        return trasher(path).map_err(Stop::Failed);
    }
    if metadata.is_dir() {
        fs::remove_dir_all(path)?;
    } else {
        remove_entry(path)?;
    }
    Ok(())
}

/// ファイルまたはディレクトリをゴミ箱へ移動します.
///
/// # Arguments
///
/// * `path` - 対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
#[cfg(not(tarpaulin_include))]
fn move_to_trash(path: &Path) -> Result<(), String> {
    trash::delete(path).map_err(|e| e.to_string())
}

/// コピー・移動・削除を, OS の実際の操作 (名前の変更・ゴミ箱) で実行します.
///
/// # Arguments
///
/// * `request` - 依頼.
/// * `cancel` - 中断フラグ.
/// * `on_progress` - 進捗を通知する関数.
///
/// # Returns
///
/// 結果. 失敗した場合はエラー文字列を含む [`Err`].
pub fn transfer(
    request: &TransferRequest,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(TransferProgress),
) -> Result<TransferSummary, String> {
    transfer_with(
        request,
        cancel,
        // 確認の後に作られた同名のものを, 上書きしないようにする.
        &rename_noreplace,
        &move_to_trash,
        on_progress,
    )
}

/// コピー・移動・削除を別スレッドで実行し, 進捗をフロントエンドへ通知します.
///
/// # Arguments
///
/// * `state` - 中断フラグを持つ状態.
/// * `request` - 依頼.
/// * `on_progress` - 進捗の通知先.
///
/// # Returns
///
/// 結果. 失敗した場合はエラー文字列を含む [`Err`].
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub async fn run_transfer(
    state: tauri::State<'_, TransferState>,
    request: TransferRequest,
    on_progress: tauri::ipc::Channel<TransferProgress>,
) -> Result<TransferSummary, String> {
    let cancel = state.begin();
    tauri::async_runtime::spawn_blocking(move || {
        transfer(&request, &cancel, &mut |p| {
            let _ = on_progress.send(p);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 実行中のコピー・移動・削除を中断します.
///
/// # Arguments
///
/// * `state` - 中断フラグを持つ状態.
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub fn cancel_transfer(state: tauri::State<'_, TransferState>) {
    log::info!("中断要求");
    state.cancel();
}

#[cfg(test)]
#[path = "../../tests/unit/commands/transfer_test.rs"]
mod tests;
