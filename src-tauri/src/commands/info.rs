//! ファイル・ディレクトリの詳細 (サイズ・日時・権限・配下の合計など) を取得するコマンド.

use crate::commands::fs::{is_hidden, unix_secs};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// 配下の合計を数える時間の上限 (秒). これを超えたら, そこまでの結果を返す.
const STATS_TIME_LIMIT_SECS: u64 = 10;
/// 配下の合計で数える項目 (ファイルとディレクトリ) の数の上限. これを超えたら, そこまでの結果を返す.
const STATS_MAX_ENTRIES: u64 = 5_000_000;

/// 項目の種類.
#[derive(Serialize, Debug, PartialEq, Eq)]
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
#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct ItemInfo {
    /// 名前.
    pub name: String,
    /// 絶対パス.
    pub path: String,
    /// 種類.
    pub kind: ItemKind,
    /// サイズ (バイト). ディレクトリでは意味を持たない.
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
#[derive(Serialize, Debug, PartialEq, Eq, Default)]
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
            let Ok(entry) = entry else {
                stats.errors += 1;
                continue;
            };
            let Ok(file_type) = entry.file_type() else {
                stats.errors += 1;
                continue;
            };
            if file_type.is_dir() {
                stats.dirs += 1;
                pending.push(entry.path());
            } else {
                stats.files += 1;
                match entry.metadata() {
                    Ok(m) => stats.bytes += m.len(),
                    Err(_) => stats.errors += 1,
                }
            }
        }
    }
    Ok(stats)
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
mod tests {
    use super::*;
    use tempfile::tempdir;

    /// 時間の上限が, 十分先の時刻.
    fn far() -> Instant {
        Instant::now() + Duration::from_secs(60)
    }

    #[test]
    fn test_mode_string_formats() {
        assert_eq!(mode_string(0o755), "rwxr-xr-x (0755)");
        assert_eq!(mode_string(0o644), "rw-r--r-- (0644)");
        assert_eq!(mode_string(0o000), "--------- (0000)");
        assert_eq!(mode_string(0o4755), "rwxr-xr-x (4755)");
        assert_eq!(mode_string(0o100644), "rw-r--r-- (0644)");
    }

    #[test]
    fn test_read_item_info_file() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("a.TXT");
        fs::write(&file, "hello").unwrap();

        let info = read_item_info(&file.to_string_lossy()).unwrap();

        assert_eq!(info.name, "a.TXT");
        assert_eq!(info.kind, ItemKind::File);
        assert_eq!(info.size, 5);
        assert_eq!(info.extension.as_deref(), Some("TXT"));
        assert!(info.modified.unwrap() > 0);
        assert!(!info.readonly);
        assert_eq!((info.child_files, info.child_dirs), (None, None));
        assert_eq!(info.symlink_target, None);
        #[cfg(unix)]
        assert!(info.permissions.unwrap().contains('r'));
    }

    #[test]
    fn test_read_item_info_directory_counts_children() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("f1"), "1").unwrap();
        fs::write(dir.path().join("f2"), "2").unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("sub/deep"), "x").unwrap();

        let info = read_item_info(&dir.path().to_string_lossy()).unwrap();

        // 直下だけを数える (sub の中の deep は数えない). ディレクトリには拡張子とサイズを持たせない.
        assert_eq!(info.kind, ItemKind::Dir);
        assert_eq!((info.child_files, info.child_dirs), (Some(2), Some(1)));
        assert_eq!((info.size, info.extension), (0, None));
    }

    #[test]
    fn test_read_item_info_readonly_hidden_and_missing() {
        let dir = tempdir().unwrap();
        let file = dir.path().join(".secret");
        fs::write(&file, "x").unwrap();
        let mut perm = fs::metadata(&file).unwrap().permissions();
        perm.set_readonly(true);
        fs::set_permissions(&file, perm).unwrap();

        let info = read_item_info(&file.to_string_lossy()).unwrap();

        assert!(info.readonly);
        assert_eq!(info.hidden, cfg!(not(windows)));
        assert!(read_item_info(&dir.path().join("none").to_string_lossy()).is_err());
        assert!(tauri::async_runtime::block_on(get_item_info(
            dir.path().join("none").to_string_lossy().into_owned()
        ))
        .is_err());
        assert!(
            tauri::async_runtime::block_on(get_item_info(file.to_string_lossy().into_owned()))
                .is_ok()
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_read_item_info_symlink_is_not_followed() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("real");
        fs::create_dir(&target).unwrap();
        let link = dir.path().join("link");
        std::os::unix::fs::symlink(&target, &link).unwrap();

        let info = read_item_info(&link.to_string_lossy()).unwrap();

        assert_eq!(info.kind, ItemKind::Symlink);
        assert_eq!(
            info.symlink_target.as_deref(),
            Some(target.to_string_lossy().as_ref())
        );
        assert_eq!((info.child_files, info.child_dirs), (None, None));
    }

    #[test]
    fn test_compute_dir_stats_totals_recursively() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a"), "1234").unwrap();
        fs::create_dir_all(dir.path().join("x/y")).unwrap();
        fs::write(dir.path().join("x/b"), "12").unwrap();
        fs::write(dir.path().join("x/y/c"), "123456").unwrap();
        let cancel = AtomicBool::new(false);

        let stats = compute_dir_stats(dir.path(), &cancel, far(), 1000).unwrap();

        assert_eq!(
            stats,
            DirStats {
                files: 3,
                dirs: 2,
                bytes: 12,
                errors: 0,
                complete: true
            }
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_compute_dir_stats_does_not_follow_symlinks() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("real")).unwrap();
        fs::write(dir.path().join("real/f"), "abc").unwrap();
        // 自分自身を指すリンク (たどると, 終わらない).
        std::os::unix::fs::symlink(dir.path(), dir.path().join("loop")).unwrap();
        let cancel = AtomicBool::new(false);

        let stats = compute_dir_stats(dir.path(), &cancel, far(), 1000).unwrap();

        // real (1 ディレクトリ), f と loop (リンクは 1 つのファイル). リンクの中身は数えない.
        assert_eq!((stats.files, stats.dirs), (2, 1));
        assert!(stats.complete);
    }

    #[test]
    fn test_compute_dir_stats_stops_on_cancel_deadline_and_limit() {
        let dir = tempdir().unwrap();
        for i in 0..5 {
            fs::write(dir.path().join(format!("f{i}")), "x").unwrap();
        }

        // 中断: すぐに止まって, 途中までの結果 (complete: false).
        let cancelled = AtomicBool::new(true);
        let stats = compute_dir_stats(dir.path(), &cancelled, far(), 1000).unwrap();
        assert!(!stats.complete);
        assert_eq!(stats.files, 0);

        // 時間切れ.
        let cancel = AtomicBool::new(false);
        let stats = compute_dir_stats(dir.path(), &cancel, Instant::now(), 1000).unwrap();
        assert!(!stats.complete);

        // 数の上限.
        let stats = compute_dir_stats(dir.path(), &cancel, far(), 3).unwrap();
        assert!(!stats.complete);
        assert_eq!(stats.files, 3);
    }

    #[test]
    fn test_compute_dir_stats_failures() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("f");
        fs::write(&file, "x").unwrap();
        let cancel = AtomicBool::new(false);

        assert!(compute_dir_stats(&file, &cancel, far(), 10)
            .unwrap_err()
            .starts_with("Not a directory"));
        assert!(compute_dir_stats(&dir.path().join("none"), &cancel, far(), 10).is_err());
    }

    #[test]
    fn test_stats_state_cancels_the_previous_calculation() {
        let state = StatsState::default();

        let first = state.begin();
        assert!(!first.load(Ordering::SeqCst));
        let second = state.begin();

        // 新しい計算が始まると, 前の計算には中断が要求され, 新しい計算は続けられる.
        assert!(first.load(Ordering::SeqCst));
        assert!(!second.load(Ordering::SeqCst));
    }
}
