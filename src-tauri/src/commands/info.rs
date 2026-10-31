//! ファイル・ディレクトリの詳細 (サイズ・日時・権限・配下の合計など) を取得するコマンド.

use crate::commands::fs::{is_hidden, unix_secs};
use serde::Serialize;
use specta::Type;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// 配下の合計を数える時間の上限 (秒). これを超えたら, そこまでの結果を返す.
const STATS_TIME_LIMIT_SECS: u64 = 10;
/// 配下の合計で数える項目 (ファイルとディレクトリ) の数の上限. これを超えたら, そこまでの結果を返す.
const STATS_MAX_ENTRIES: u64 = 5_000_000;

/// 項目の種類.
#[derive(Serialize, Type, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ItemKind {
    /// ファイル.
    File,
    /// ディレクトリ.
    Dir,
    /// シンボリックリンク.
    Symlink,
    /// そのほか (デバイス・ソケットなど).
    Other,
}

/// 1 つの項目の詳細.
#[derive(Serialize, Type, Debug, PartialEq, Eq)]
pub struct ItemInfo {
    /// 名前.
    pub name: String,
    /// 絶対パス.
    pub path: String,
    /// 種類.
    pub kind: ItemKind,
    /// サイズ (バイト). ディレクトリでは 0.
    pub size: u64,
    /// 最終更新日時 (UNIX 時刻の秒). 取得できない場合は `None`.
    pub modified: Option<i64>,
    /// 作成日時 (UNIX 時刻の秒). 取得できない場合 (OS・ファイルシステムが持たない) は `None`.
    pub created: Option<i64>,
    /// 最終アクセス日時 (UNIX 時刻の秒). 取得できない場合は `None`.
    pub accessed: Option<i64>,
    /// 読み取り専用の場合は `true`.
    pub readonly: bool,
    /// 隠しファイルの場合は `true`.
    pub hidden: bool,
    /// 権限 (例: `rwxr-xr-x (0755)`). Unix のみ. それ以外は `None`.
    pub permissions: Option<String>,
    /// シンボリックリンクの, リンク先. リンクでない場合は `None`.
    pub symlink_target: Option<String>,
    /// 拡張子 (ドットなし). 無い場合は `None`.
    pub extension: Option<String>,
    /// ディレクトリの直下にあるファイルの数 (ディレクトリ以外のものすべて). ディレクトリ以外は `None`.
    pub child_files: Option<u64>,
    /// ディレクトリの直下にあるディレクトリの数. ディレクトリ以外は `None`.
    pub child_dirs: Option<u64>,
}

/// ディレクトリの配下 (再帰) の合計.
#[derive(Serialize, Type, Debug, PartialEq, Eq, Default)]
pub struct DirStats {
    /// ファイルの数 (ディレクトリ以外のものすべて. シンボリックリンクは, たどらずに, 1 件と数える).
    pub files: u64,
    /// ディレクトリの数 (対象自身を含まない).
    pub dirs: u64,
    /// ファイルの合計サイズ (バイト).
    pub bytes: u64,
    /// 読み取れなかった項目の数 (権限がないなど).
    pub errors: u64,
    /// 最後まで数えた場合は `true`. 中断・時間・数の上限で止めた場合は `false` (そこまでの合計).
    pub complete: bool,
}

/// 配下の合計の計算を, 新しい要求が来たら中断するための状態.
#[derive(Default)]
pub struct StatsState {
    /// 実行中の計算の中断フラグ.
    current: Mutex<Option<Arc<AtomicBool>>>,
}

impl StatsState {
    /// 実行中の計算があれば中断を要求し, 新しい計算のための中断フラグを返します.
    ///
    /// # Returns
    ///
    /// 新しい計算が確認する, 中断フラグ.
    pub fn begin(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut current) = self.current.lock() {
            if let Some(previous) = current.replace(Arc::clone(&flag)) {
                previous.store(true, Ordering::SeqCst);
            }
        }
        flag
    }
}

/// Unix の権限 (モード) を, `rwxr-xr-x (0755)` の形に整形します.
///
/// # Arguments
///
/// * `mode` - ファイルのモード (下位 12 ビットだけを使う).
///
/// # Returns
///
/// 所有者・グループ・その他の `rwx` と, 8 進数のモード.
pub fn mode_string(mode: u32) -> String {
    let bit = |mask: u32, ch: char| if mode & mask != 0 { ch } else { '-' };
    let triple = |shift: u32| {
        format!(
            "{}{}{}",
            bit(0o4 << shift, 'r'),
            bit(0o2 << shift, 'w'),
            bit(0o1 << shift, 'x')
        )
    };
    format!(
        "{}{}{} ({:04o})",
        triple(6),
        triple(3),
        triple(0),
        mode & 0o7777
    )
}

/// ディレクトリの直下の, ファイルとディレクトリの数を数えます.
///
/// # Arguments
///
/// * `path` - 対象のディレクトリ.
///
/// # Returns
///
/// (ファイルの数, ディレクトリの数). 読めない場合は `(0, 0)`.
fn count_children(path: &Path) -> (u64, u64) {
    let Ok(entries) = fs::read_dir(path) else {
        return (0, 0);
    };
    let mut files = 0;
    let mut dirs = 0;
    for entry in entries.flatten() {
        if entry.file_type().is_ok_and(|t| t.is_dir()) {
            dirs += 1;
        } else {
            files += 1;
        }
    }
    (files, dirs)
}

/// 項目の詳細を読み取ります.
///
/// # Arguments
///
/// * `path` - 対象の絶対パス (シンボリックリンクはたどらず, リンク自身を調べる).
///
/// # Returns
///
/// 詳細. 存在しない・読めない場合は, エラー文字列を含む [`Err`].
pub fn read_item_info(path: &str) -> Result<ItemInfo, String> {
    let target = Path::new(path);
    let metadata = fs::symlink_metadata(target).map_err(|e| format!("{}: {}", path, e))?;
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());
    let file_type = metadata.file_type();
    let kind = if file_type.is_symlink() {
        ItemKind::Symlink
    } else if file_type.is_dir() {
        ItemKind::Dir
    } else if file_type.is_file() {
        ItemKind::File
    } else {
        ItemKind::Other
    };
    let (child_files, child_dirs) = if kind == ItemKind::Dir {
        let (files, dirs) = count_children(target);
        (Some(files), Some(dirs))
    } else {
        (None, None)
    };
    #[cfg(unix)]
    let permissions = {
        use std::os::unix::fs::PermissionsExt;
        Some(mode_string(metadata.permissions().mode()))
    };
    #[cfg(not(unix))]
    let permissions = None;
    Ok(ItemInfo {
        hidden: is_hidden(&name, &metadata),
        extension: target
            .extension()
            .map(|e| e.to_string_lossy().into_owned())
            .filter(|_| kind != ItemKind::Dir),
        symlink_target: if kind == ItemKind::Symlink {
            fs::read_link(target)
                .ok()
                .map(|t| t.to_string_lossy().into_owned())
        } else {
            None
        },
        size: if kind == ItemKind::Dir {
            0
        } else {
            metadata.len()
        },
        modified: metadata.modified().ok().and_then(unix_secs),
        created: metadata.created().ok().and_then(unix_secs),
        accessed: metadata.accessed().ok().and_then(unix_secs),
        readonly: metadata.permissions().readonly(),
        name,
        path: path.to_string(),
        kind,
        permissions,
        child_files,
        child_dirs,
    })
}

/// ディレクトリの配下を再帰的にたどって, ファイル・ディレクトリの数と合計サイズを数えます.
///
/// シンボリックリンクはたどりません (ループを避ける). 中断・時間・数の上限で止めた場合は,
/// そこまでの合計を, `complete: false` で返します.
///
/// # Arguments
///
/// * `root` - 対象のディレクトリ.
/// * `cancel` - 中断フラグ. true になったら止める.
/// * `deadline` - この時刻を過ぎたら止める.
/// * `max_entries` - 数える項目の数の上限.
///
/// # Returns
///
/// 合計. 対象がディレクトリでない・存在しない場合は, エラー文字列を含む [`Err`].
pub fn compute_dir_stats(
    root: &Path,
    cancel: &AtomicBool,
    deadline: Instant,
    max_entries: u64,
) -> Result<DirStats, String> {
    let metadata = fs::symlink_metadata(root).map_err(|e| format!("{}: {}", root.display(), e))?;
    if !metadata.is_dir() {
        return Err(format!("Not a directory: {}", root.display()));
    }
    let mut stats = DirStats {
        complete: true,
        ..DirStats::default()
    };
    let mut pending = vec![root.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            stats.errors += 1;
            continue;
        };
        for entry in entries {
            if cancel.load(Ordering::SeqCst)
                || Instant::now() >= deadline
                || stats.files + stats.dirs >= max_entries
            {
                stats.complete = false;
                return Ok(stats);
            }
            tally_entry(&mut stats, &mut pending, entry);
        }
    }
    Ok(stats)
}

/// 配下の合計を数えるときの, 1 つの項目の種類.
enum StatsEntry {
    /// ディレクトリ. 中をたどる.
    Dir(PathBuf),
    /// ディレクトリ以外. 大きさ (バイト) を取得できなかった場合は `None`.
    File(Option<u64>),
}

/// ディレクトリの項目の種類を調べます.
///
/// # Arguments
///
/// * `entry` - `read_dir` で得た項目.
///
/// # Returns
///
/// 種類. 項目やその種類を読めない場合は `None`.
fn stats_entry(entry: io::Result<fs::DirEntry>) -> Option<StatsEntry> {
    let entry = entry.ok()?;
    let file_type = entry.file_type().ok()?;
    if file_type.is_dir() {
        Some(StatsEntry::Dir(entry.path()))
    } else {
        Some(StatsEntry::File(entry.metadata().ok().map(|m| m.len())))
    }
}

/// ディレクトリの 1 つの項目を, 合計に加えます. ディレクトリは, 後でたどるよう `pending` に積みます.
///
/// 読めない項目と, 大きさを取得できなかったファイルは, エラーとして数えます.
///
/// # Arguments
///
/// * `stats` - 合計.
/// * `pending` - これからたどるディレクトリ.
/// * `entry` - `read_dir` で得た項目.
fn tally_entry(stats: &mut DirStats, pending: &mut Vec<PathBuf>, entry: io::Result<fs::DirEntry>) {
    match stats_entry(entry) {
        Some(StatsEntry::Dir(path)) => {
            stats.dirs += 1;
            pending.push(path);
        }
        Some(StatsEntry::File(len)) => {
            stats.files += 1;
            stats.bytes += len.unwrap_or(0);
            stats.errors += u64::from(len.is_none());
        }
        None => stats.errors += 1,
    }
}

/// 項目の詳細を取得します (IPC コマンド). 走査 (ディスク I/O) は, ブロッキング用のスレッドで実行します.
///
/// # Arguments
///
/// * `path` - 対象の絶対パス.
///
/// # Returns
///
/// 詳細. 失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command]
#[specta::specta]
pub async fn get_item_info(path: String) -> Result<ItemInfo, String> {
    let result = tauri::async_runtime::spawn_blocking(move || read_item_info(&path))
        .await
        .map_err(|e| e.to_string())?;
    if let Err(e) = &result {
        log::warn!("詳細の取得失敗: {}", e);
    }
    result
}

/// ディレクトリの配下の合計を数えます (IPC コマンド).
///
/// 数えるのはブロッキング用のスレッドで, 時間の上限 (10 秒) と数の上限があります. 新しく呼ばれると,
/// 前の計算は中断されます (カーソルが動いたとき, 前の項目の計算を続けないため).
///
/// # Arguments
///
/// * `state` - 中断のための状態.
/// * `path` - 対象のディレクトリ.
///
/// # Returns
///
/// 合計. 失敗した場合はエラー文字列を含む [`Err`].
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub async fn dir_stats(
    state: tauri::State<'_, StatsState>,
    path: String,
) -> Result<DirStats, String> {
    let cancel = state.begin();
    tauri::async_runtime::spawn_blocking(move || {
        compute_dir_stats(
            Path::new(&path),
            &cancel,
            Instant::now() + Duration::from_secs(STATS_TIME_LIMIT_SECS),
            STATS_MAX_ENTRIES,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
#[path = "../../tests/unit/commands/test_info.rs"]
mod tests;
