//! ファイル・ディレクトリのコピー・移動・削除を, 進捗の通知と中断に対応して実行するコマンド.
//!
//! 処理は別スレッドで実行し, 進捗は Tauri の [`Channel`](tauri::ipc::Channel) でフロントエンドへ送ります.
//! 中断は [`TransferState`] の中断フラグで受け付け, 大きなファイルはチャンクごとにフラグを確認します.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// 1 回の読み書きで扱うバイト数.
const CHUNK_SIZE: usize = 1024 * 1024;

/// 実行する操作の種類.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
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
#[derive(Deserialize, Debug)]
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
}

/// 進捗の通知.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct TransferProgress {
    /// 処理済みの量. コピー・移動ではバイト数, 削除では件数.
    pub done: u64,
    /// 全体の量. 単位は `done` と同じ.
    pub total: u64,
    /// 処理中の項目の名前.
    pub current: String,
}

/// 操作の結果.
#[derive(Serialize, Debug, PartialEq, Eq)]
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
    /// 進捗を通知する関数.
    on_progress: &'a mut dyn FnMut(TransferProgress),
    /// 処理済みの量.
    done: u64,
    /// 全体の量.
    total: u64,
}

impl Progress<'_> {
    /// 中断が要求されていれば [`Stop::Cancelled`] を返します.
    fn check(&self) -> Result<(), Stop> {
        if self.cancel.load(Ordering::SeqCst) {
            Err(Stop::Cancelled)
        } else {
            Ok(())
        }
    }

    /// 処理済みの量を加えて通知します.
    fn advance(&mut self, amount: u64, current: &str) {
        self.done += amount;
        (self.on_progress)(TransferProgress {
            done: self.done,
            total: self.total,
            current: current.to_string(),
        });
    }
}

/// ファイルまたはディレクトリ以下の合計サイズ (バイト) を返します. 読めないものは 0 として数えます.
///
/// # Arguments
///
/// * `path` - 対象のパス.
///
/// # Returns
///
/// 合計サイズ.
fn tree_size(path: &Path) -> u64 {
    let Ok(meta) = fs::metadata(path) else {
        return 0;
    };
    if !meta.is_dir() {
        return meta.len();
    }
    fs::read_dir(path)
        .map(|entries| entries.flatten().map(|e| tree_size(&e.path())).sum::<u64>())
        .unwrap_or(0)
}

/// 1 つのファイルを, 進捗と中断を確認しながらコピーします. 中断された場合は, 書きかけのファイルを消します.
///
/// # Arguments
///
/// * `src` - コピー元のファイル.
/// * `dst` - コピー先のファイル (上書きされる).
/// * `progress` - 進捗の窓口.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 中断・失敗した場合は [`Stop`].
fn copy_file(src: &Path, dst: &Path, progress: &mut Progress) -> Result<(), Stop> {
    let name = file_name_of(src);
    let mut reader = fs::File::open(src)?;
    let mut writer = fs::File::create(dst)?;
    let mut buf = vec![0u8; CHUNK_SIZE];
    loop {
        if progress.check().is_err() {
            // 書き込み中のハンドルを閉じてから消す (開いたままだと Windows などで削除できない).
            drop(writer);
            let _ = fs::remove_file(dst);
            return Err(Stop::Cancelled);
        }
        let n = reader.read(&mut buf)?;
        if n == 0 {
            // 読み取り 0 バイトはファイル末尾.
            break;
        }
        writer.write_all(&buf[..n])?;
        progress.advance(n as u64, &name);
    }
    drop(writer);
    // 権限だけコピーする. 失敗しても (読み取り専用の配置先など) コピー自体は成功として扱う.
    if let Ok(meta) = fs::metadata(src) {
        let _ = fs::set_permissions(dst, meta.permissions());
    }
    Ok(())
}

/// ファイルまたはディレクトリを再帰的にコピーします.
///
/// # Arguments
///
/// * `src` - コピー元.
/// * `dst` - コピー先 (名前を含むパス). 既存のディレクトリには内容を統合します.
/// * `progress` - 進捗の窓口.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 中断・失敗した場合は [`Stop`].
fn copy_tree(src: &Path, dst: &Path, progress: &mut Progress) -> Result<(), Stop> {
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            copy_tree(&entry.path(), &dst.join(entry.file_name()), progress)?;
        }
        Ok(())
    } else {
        copy_file(src, dst, progress)
    }
}

/// パスの最後の名前を文字列で返します.
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
#[tauri::command]
pub fn check_conflicts(
    sources: Vec<String>,
    dest_dir: String,
    dest_name: Option<String>,
) -> Result<Vec<String>, String> {
    find_conflicts(&sources, &dest_dir, dest_name.as_deref())
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
        if fs::symlink_metadata(&src).is_err() {
            return Err(format!("Path does not exist: {}", source));
        }
        let dst = if let Some(name) = &request.dest_name {
            join_valid_name(dest_dir.to_str().unwrap(), name)?
        } else {
            destination_of(&src, dest_dir, None)?
        };
        let src_canonical = fs::canonicalize(&src).map_err(|e| e.to_string())?;

        // dest_name がある場合は, 同一ディレクトリ別名の配置を許可する.
        if request.dest_name.is_none() && src_canonical.parent() == Some(dest_canonical.as_path()) {
            // 配置先が対象自身の親, つまり同じディレクトリへの配置は無意味なので拒否する.
            return Err(format!(
                "Source and destination are the same: {}",
                src.display()
            ));
        }
        if src_canonical.is_dir() && dest_canonical.starts_with(&src_canonical) {
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
/// # Arguments
///
/// * `src` - 移動元.
/// * `dst` - 移動先 (名前を含むパス).
/// * `overwrite` - true の場合, 同名のファイルを上書きする. ディレクトリの上書きはしない.
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
    if let Ok(meta) = fs::symlink_metadata(dst) {
        if meta.is_dir() {
            // ディレクトリ同士の上書きは, 中身の統合が必要で挙動が分かりにくくなるため, 常に拒否する.
            return Err(Stop::Failed(format!(
                "Destination directory already exists: {}",
                dst.display()
            )));
        }
        if overwrite {
            fs::remove_file(dst)?;
        }
    }
    let size = tree_size(src);
    if renamer(src, dst).is_ok() {
        // 名前の変更で移せた (同一ディスク内). 進捗はサイズ分をまとめて進める.
        progress.advance(size, &file_name_of(src));
        return Ok(());
    }
    // 名前の変更に失敗した場合 (別のディスクへの移動など) は, コピーしてから元を消す.
    copy_tree(src, dst, progress)?;
    if src.is_dir() {
        fs::remove_dir_all(src)?;
    } else {
        fs::remove_file(src)?;
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
    let mut processed = 0;
    // 削除は件数, コピー・移動はバイト数で進捗を数えるため, 種類ごとに全体量の求め方が異なる.
    // try_for_each は, 途中の要素が Err (中断・失敗) を返した時点でそこで止まり, 残りは処理しない.
    let result = match request.kind {
        TransferKind::Delete => {
            let mut progress = Progress {
                cancel,
                on_progress,
                done: 0,
                total: request.sources.len() as u64,
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
                on_progress,
                done: 0,
                total,
            };
            plan.iter().try_for_each(|(src, dst)| {
                progress.check()?;
                if kind == TransferKind::Copy {
                    copy_tree(src, dst, &mut progress)?;
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
        fs::remove_file(path)?;
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
        &|a, b| fs::rename(a, b),
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
pub fn cancel_transfer(state: tauri::State<'_, TransferState>) {
    log::info!("中断要求");
    state.cancel();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use tempfile::tempdir;

    /// テスト用の依頼を作る.
    fn request(kind: TransferKind, sources: &[&Path], dest: Option<&Path>) -> TransferRequest {
        TransferRequest {
            kind,
            sources: sources
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect(),
            dest_dir: dest.map(|p| p.to_string_lossy().into_owned()),
            overwrite: false,
            permanent: true,
            dest_name: None,
        }
    }

    /// 進捗を記録しながら, 実際の操作で実行する.
    fn run(req: &TransferRequest) -> (Result<TransferSummary, String>, Vec<TransferProgress>) {
        let events = RefCell::new(Vec::new());
        let cancel = AtomicBool::new(false);
        let result = transfer(req, &cancel, &mut |p| events.borrow_mut().push(p));
        (result, events.into_inner())
    }

    #[test]
    fn test_transfer_copy_file_success() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("a.txt");
        let dest = dir.path().join("dest");
        fs::create_dir(&dest).unwrap();
        fs::write(&src, "hello").unwrap();

        let (result, events) = run(&request(TransferKind::Copy, &[&src], Some(&dest)));

        assert_eq!(
            result.unwrap(),
            TransferSummary {
                processed: 1,
                cancelled: false
            }
        );
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "hello");
        assert!(src.exists());
        let last = events.last().unwrap();
        assert_eq!((last.done, last.total), (5, 5));
        assert_eq!(last.current, "a.txt");
    }

    #[test]
    fn test_transfer_copy_directory_recursively() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("d");
        fs::create_dir_all(src.join("sub")).unwrap();
        fs::write(src.join("f1"), "1234").unwrap();
        fs::write(src.join("sub/f2"), "56").unwrap();
        let dest = dir.path().join("dest");
        fs::create_dir(&dest).unwrap();

        let (result, events) = run(&request(TransferKind::Copy, &[&src], Some(&dest)));

        assert!(result.is_ok());
        assert_eq!(fs::read_to_string(dest.join("d/sub/f2")).unwrap(), "56");
        assert_eq!(events.last().unwrap().total, 6);
    }

    #[test]
    fn test_transfer_copy_existing_requires_overwrite() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("a.txt");
        let dest = dir.path().join("dest");
        fs::create_dir(&dest).unwrap();
        fs::write(&src, "new").unwrap();
        fs::write(dest.join("a.txt"), "old").unwrap();

        let mut req = request(TransferKind::Copy, &[&src], Some(&dest));
        let (result, _) = run(&req);
        assert!(result.unwrap_err().starts_with("Already exists"));
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "old");

        req.overwrite = true;
        assert!(run(&req).0.is_ok());
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "new");
    }

    #[test]
    fn test_transfer_copy_same_directory_failure() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("a.txt");
        fs::write(&src, "x").unwrap();
        let (result, _) = run(&request(TransferKind::Copy, &[&src], Some(dir.path())));
        assert!(result.unwrap_err().starts_with("Source and destination"));
    }

    #[test]
    fn test_transfer_copy_into_itself_failure() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("d");
        let inner = src.join("inner");
        fs::create_dir_all(&inner).unwrap();
        let (result, _) = run(&request(TransferKind::Copy, &[&src], Some(&inner)));
        assert!(result.unwrap_err().starts_with("Cannot place"));
    }

    #[test]
    fn test_transfer_validation_failure() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("f");
        fs::write(&file, "x").unwrap();
        let missing = dir.path().join("missing");

        assert_eq!(
            run(&request(TransferKind::Copy, &[], Some(dir.path())))
                .0
                .unwrap_err(),
            "No targets"
        );
        assert!(run(&request(TransferKind::Copy, &[&file], None))
            .0
            .unwrap_err()
            .contains("required"));
        assert!(run(&request(TransferKind::Copy, &[&file], Some(&file)))
            .0
            .unwrap_err()
            .contains("not a directory"));
        assert!(
            run(&request(TransferKind::Copy, &[&missing], Some(dir.path())))
                .0
                .unwrap_err()
                .starts_with("Path does not exist")
        );
        assert!(run(&request(
            TransferKind::Copy,
            &[Path::new("/")],
            Some(dir.path())
        ))
        .0
        .unwrap_err()
        .starts_with("Invalid source path"));
    }

    #[test]
    fn test_transfer_move_file_and_directory_success() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("a.txt");
        let sub = dir.path().join("d");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("x"), "x").unwrap();
        fs::write(&file, "hello").unwrap();
        let dest = dir.path().join("dest");
        fs::create_dir(&dest).unwrap();

        let (result, events) = run(&request(TransferKind::Move, &[&file, &sub], Some(&dest)));

        assert_eq!(result.unwrap().processed, 2);
        assert!(!file.exists() && !sub.exists());
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "hello");
        assert!(dest.join("d/x").exists());
        assert_eq!(events.last().unwrap().done, 6);
    }

    #[test]
    fn test_transfer_move_falls_back_to_copy_when_rename_fails() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("a.txt");
        let sub = dir.path().join("d");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("x"), "x").unwrap();
        fs::write(&file, "hello").unwrap();
        let dest = dir.path().join("dest");
        fs::create_dir(&dest).unwrap();
        let cancel = AtomicBool::new(false);

        let result = transfer_with(
            &request(TransferKind::Move, &[&file, &sub], Some(&dest)),
            &cancel,
            &|_, _| Err(std::io::Error::other("cross device")),
            &|_| Ok(()),
            &mut |_| {},
        );

        assert_eq!(result.unwrap().processed, 2);
        assert!(!file.exists() && !sub.exists());
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "hello");
        assert!(dest.join("d/x").exists());
    }

    #[test]
    fn test_transfer_move_overwrite_and_existing_directory() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("a.txt");
        let dest = dir.path().join("dest");
        fs::create_dir_all(dest.join("d")).unwrap();
        fs::write(&src, "new").unwrap();
        fs::write(dest.join("a.txt"), "old").unwrap();

        let mut req = request(TransferKind::Move, &[&src], Some(&dest));
        req.overwrite = true;
        assert!(run(&req).0.is_ok());
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "new");

        let subdir = dir.path().join("d");
        fs::create_dir(&subdir).unwrap();
        let mut req = request(TransferKind::Move, &[&subdir], Some(&dest));
        req.overwrite = true;
        assert!(run(&req).0.unwrap_err().contains("already exists"));
    }

    #[test]
    fn test_transfer_delete_permanent_success() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("f");
        let sub = dir.path().join("d");
        fs::create_dir_all(sub.join("x")).unwrap();
        fs::write(&file, "x").unwrap();

        let (result, events) = run(&request(TransferKind::Delete, &[&file, &sub], None));

        assert_eq!(result.unwrap().processed, 2);
        assert!(!file.exists() && !sub.exists());
        assert_eq!(
            (events.last().unwrap().done, events.last().unwrap().total),
            (2, 2)
        );
    }

    #[test]
    fn test_transfer_delete_trash_uses_trasher() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("f");
        fs::write(&file, "x").unwrap();
        let mut req = request(TransferKind::Delete, &[&file], None);
        req.permanent = false;
        let cancel = AtomicBool::new(false);
        let called = RefCell::new(Vec::new());

        let result = transfer_with(
            &req,
            &cancel,
            &|a, b| fs::rename(a, b),
            &|p| {
                called.borrow_mut().push(p.to_path_buf());
                Ok(())
            },
            &mut |_| {},
        );
        assert!(result.is_ok());
        assert_eq!(called.into_inner(), vec![file.clone()]);
        assert!(file.exists());

        let failed = transfer_with(
            &req,
            &cancel,
            &|a, b| fs::rename(a, b),
            &|_| Err("trash failed".to_string()),
            &mut |_| {},
        );
        assert_eq!(failed.unwrap_err(), "trash failed");
    }

    #[test]
    fn test_transfer_delete_missing_failure() {
        let dir = tempdir().unwrap();
        let missing = dir.path().join("missing");
        let (result, _) = run(&request(TransferKind::Delete, &[&missing], None));
        assert!(result.unwrap_err().starts_with("Path does not exist"));
    }

    #[test]
    fn test_transfer_cancel_before_start() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("f");
        fs::write(&file, "x").unwrap();
        let cancel = AtomicBool::new(true);

        let result = transfer(
            &request(TransferKind::Delete, &[&file], None),
            &cancel,
            &mut |_| {},
        );

        assert_eq!(
            result.unwrap(),
            TransferSummary {
                processed: 0,
                cancelled: true
            }
        );
        assert!(file.exists());
    }

    #[test]
    fn test_transfer_cancel_during_copy_removes_partial_file() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("big.bin");
        fs::write(&src, vec![7u8; CHUNK_SIZE * 2 + 10]).unwrap();
        let dest = dir.path().join("dest");
        fs::create_dir(&dest).unwrap();
        let cancel = AtomicBool::new(false);

        let result = transfer(
            &request(TransferKind::Copy, &[&src], Some(&dest)),
            &cancel,
            &mut |_| cancel.store(true, Ordering::SeqCst),
        );

        assert_eq!(
            result.unwrap(),
            TransferSummary {
                processed: 0,
                cancelled: true
            }
        );
        assert!(!dest.join("big.bin").exists());
        assert!(src.exists());
    }

    #[test]
    fn test_find_conflicts_success() {
        let dir = tempdir().unwrap();
        let dest = dir.path().join("dest");
        fs::create_dir(&dest).unwrap();
        fs::write(dest.join("a"), "").unwrap();
        let sources = vec!["/x/a".to_string(), "/x/b".to_string()];

        assert_eq!(
            find_conflicts(&sources, dest.to_str().unwrap(), None).unwrap(),
            vec!["a".to_string()]
        );
        assert_eq!(
            check_conflicts(sources, dest.to_string_lossy().into_owned(), None).unwrap(),
            vec!["a".to_string()]
        );
        assert!(find_conflicts(&["/".to_string()], "/tmp", None).is_err());
    }

    #[test]
    fn test_transfer_copy_same_directory_rename_success() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("a.txt");
        fs::write(&src, "hello").unwrap();

        let mut req = request(TransferKind::Copy, &[&src], Some(dir.path()));
        req.dest_name = Some("b.txt".to_string());
        let (result, events) = run(&req);

        assert_eq!(
            result.unwrap(),
            TransferSummary {
                processed: 1,
                cancelled: false
            }
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("b.txt")).unwrap(),
            "hello"
        );
        assert!(src.exists());
        assert_eq!(events.last().unwrap().current, "a.txt");
    }

    #[test]
    fn test_transfer_copy_same_directory_rename_conflict() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("a.txt");
        let existing = dir.path().join("b.txt");
        fs::write(&src, "hello").unwrap();
        fs::write(&existing, "existing").unwrap();

        let mut req = request(TransferKind::Copy, &[&src], Some(dir.path()));
        req.dest_name = Some("b.txt".to_string());
        let (result, _) = run(&req);

        assert!(result.unwrap_err().starts_with("Already exists"));
    }

    #[test]
    fn test_transfer_copy_dest_name_requires_single_source() {
        let dir = tempdir().unwrap();
        let src1 = dir.path().join("a.txt");
        let src2 = dir.path().join("b.txt");
        fs::write(&src1, "1").unwrap();
        fs::write(&src2, "2").unwrap();

        let mut req = request(TransferKind::Copy, &[&src1, &src2], Some(dir.path()));
        req.dest_name = Some("c.txt".to_string());
        let (result, _) = run(&req);

        assert_eq!(
            result.unwrap_err(),
            "dest_name requires exactly one source file"
        );
    }

    #[test]
    fn test_transfer_move_dest_name_not_allowed() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("a.txt");
        let dest = dir.path().join("dest");
        fs::write(&src, "hello").unwrap();
        fs::create_dir(&dest).unwrap();

        let mut req = request(TransferKind::Move, &[&src], Some(&dest));
        req.dest_name = Some("b.txt".to_string());
        let (result, _) = run(&req);

        assert_eq!(result.unwrap_err(), "dest_name is only allowed for Copy");
    }

    #[test]
    fn test_transfer_copy_dest_name_invalid_name() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("a.txt");
        fs::write(&src, "hello").unwrap();

        let mut req = request(TransferKind::Copy, &[&src], Some(dir.path()));
        req.dest_name = Some("..".to_string());
        let (result, _) = run(&req);

        assert!(result.unwrap_err().starts_with("Invalid name"));
    }

    #[test]
    fn test_transfer_state_begin_and_cancel() {
        let state = TransferState::default();
        let flag = state.begin();
        assert!(!flag.load(Ordering::SeqCst));
        state.cancel();
        assert!(flag.load(Ordering::SeqCst));
        assert!(!state.begin().load(Ordering::SeqCst));
    }
}
