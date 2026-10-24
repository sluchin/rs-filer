//! `commands::info` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `commands::info` の子モジュール (`#[path]`) として組み込む.

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
        tauri::async_runtime::block_on(get_item_info(file.to_string_lossy().into_owned())).is_ok()
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

/// 読めないディレクトリ (権限 000) を作る. root で動いていて読めてしまう場合は `None`.
#[cfg(unix)]
fn unreadable_dir(path: &Path) -> Option<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::create_dir(path).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o000)).unwrap();
    if fs::read_dir(path).is_ok() {
        return None;
    }
    Some(())
}

/// 権限を戻して, 一時ディレクトリを消せるようにする.
#[cfg(unix)]
fn restore(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
}

#[cfg(unix)]
#[test]
fn test_read_item_info_other_kind_and_unreadable_directory() {
    let dir = tempdir().unwrap();
    // ソケットは, ファイルでもディレクトリでもない (その他).
    let socket = dir.path().join("s.sock");
    let _listener = std::os::unix::net::UnixListener::bind(&socket).unwrap();
    let info = read_item_info(&socket.to_string_lossy()).unwrap();
    assert_eq!(info.kind, ItemKind::Other);

    // 読めないディレクトリは, 直下の数を 0 とする.
    let locked = dir.path().join("locked");
    if unreadable_dir(&locked).is_none() {
        return;
    }
    let info = read_item_info(&locked.to_string_lossy());
    restore(&locked);
    let info = info.unwrap();
    assert_eq!(info.kind, ItemKind::Dir);
    assert_eq!((info.child_files, info.child_dirs), (Some(0), Some(0)));
}

#[cfg(unix)]
#[test]
fn test_compute_dir_stats_counts_unreadable_directory_as_error() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("f"), "12").unwrap();
    let locked = dir.path().join("locked");
    if unreadable_dir(&locked).is_none() {
        return;
    }

    let stats = compute_dir_stats(dir.path(), &AtomicBool::new(false), far(), 100);
    restore(&locked);
    let stats = stats.unwrap();

    assert_eq!((stats.files, stats.dirs, stats.bytes), (1, 1, 2));
    assert_eq!(stats.errors, 1);
    assert!(stats.complete);
}

#[test]
fn test_tally_entry_counts_unreadable_entry_and_size_as_errors() {
    let mut stats = DirStats::default();
    let mut pending = Vec::new();

    tally_entry(&mut stats, &mut pending, Err(io::Error::other("boom")));
    assert_eq!(stats.errors, 1);

    // 大きさを取得できなかったファイルも, ファイルとして数えたうえで, エラーに数える.
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("gone"), "x").unwrap();
    let entry = fs::read_dir(dir.path()).unwrap().next().unwrap();
    fs::remove_file(dir.path().join("gone")).unwrap();
    tally_entry(&mut stats, &mut pending, entry);

    assert_eq!((stats.files, stats.bytes, stats.errors), (1, 0, 2));
    assert!(pending.is_empty());
}
