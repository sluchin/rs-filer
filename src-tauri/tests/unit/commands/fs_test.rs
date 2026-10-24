//! `commands::fs` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `commands::fs` の子モジュール (`#[path]`) として組み込む.

use super::*;
use tempfile::tempdir;

#[test]
fn test_read_directory_metadata_success() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("a.txt"), "hello").unwrap();
    fs::write(dir.path().join(".hidden"), "").unwrap();
    let ro = dir.path().join("ro.txt");
    fs::write(&ro, "").unwrap();
    let mut perm = fs::metadata(&ro).unwrap().permissions();
    perm.set_readonly(true);
    fs::set_permissions(&ro, perm).unwrap();

    let files = scan_directory(&dir.path().to_string_lossy()).unwrap();
    let get = |n: &str| files.iter().find(|f| f.name == n).unwrap();

    assert_eq!(get("a.txt").size, 5);
    assert!(get("a.txt").modified.unwrap() > 0);
    assert!(!get("a.txt").readonly);
    assert!(!get("a.txt").hidden);
    assert!(get("ro.txt").readonly);
    assert!(get(".hidden").hidden == cfg!(not(windows)));
}

#[test]
fn test_dirs_have_entries_empty_files_hidden_and_missing() {
    let dir = tempdir().unwrap();
    let path_of = |name: &str| dir.path().join(name).to_string_lossy().into_owned();
    for name in [
        "empty",
        "with_file",
        "with_dir",
        "only_hidden",
        "missing_parent",
    ] {
        if name != "missing_parent" {
            fs::create_dir(dir.path().join(name)).unwrap();
        }
    }
    fs::write(dir.path().join("with_file").join("a.txt"), "x").unwrap();
    fs::create_dir(dir.path().join("with_dir").join("sub")).unwrap();
    fs::write(dir.path().join("only_hidden").join(".secret"), "x").unwrap();
    let paths = vec![
        path_of("empty"),
        path_of("with_file"),
        path_of("with_dir"),
        path_of("only_hidden"),
        path_of("none"),
    ];

    let shown = tauri::async_runtime::block_on(dirs_have_entries(paths.clone(), true)).unwrap();
    let hidden_off = tauri::async_runtime::block_on(dirs_have_entries(paths, false)).unwrap();

    assert_eq!(shown, vec![false, true, true, true, false]);
    // Windows では, 名前が `.` で始まるだけでは隠しファイルにならない.
    assert_eq!(hidden_off, vec![false, true, true, cfg!(windows), false]);
}

#[test]
fn test_read_directory_async_success_and_failure() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("a.txt"), "x").unwrap();

    let files =
        tauri::async_runtime::block_on(read_directory(dir.path().to_string_lossy().into_owned()))
            .unwrap();
    assert_eq!(files.len(), 1);

    let missing = dir.path().join("none").to_string_lossy().into_owned();
    assert!(tauri::async_runtime::block_on(read_directory(missing)).is_err());
}

#[test]
fn test_modified_secs_before_epoch() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("old");
    let f = fs::File::create(&file).unwrap();
    f.set_modified(UNIX_EPOCH - std::time::Duration::from_secs(60))
        .unwrap();
    assert_eq!(modified_secs(&fs::metadata(&file).unwrap()), Some(-60));
}

#[test]
fn test_complete_path_with_success() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("alpha")).unwrap();
    fs::create_dir_all(dir.path().join("alps")).unwrap();
    fs::create_dir_all(dir.path().join("beta")).unwrap();
    fs::create_dir_all(dir.path().join(".hidden")).unwrap();
    fs::write(dir.path().join("alfile"), "").unwrap();
    let base = format!("{}/", dir.path().display());

    assert_eq!(
        complete_path_with(&format!("{}al", base), None),
        vec![format!("{}alpha/", base), format!("{}alps/", base)]
    );
    assert_eq!(
        complete_path_with(&base, None),
        vec![
            format!("{}alpha/", base),
            format!("{}alps/", base),
            format!("{}beta/", base)
        ]
    );
    assert_eq!(
        complete_path_with(&format!("{}.", base), None),
        vec![format!("{}.hidden/", base)]
    );
}

#[test]
fn test_complete_path_with_home_and_failures() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("docs")).unwrap();

    assert_eq!(
        complete_path_with("~/do", Some(dir.path())),
        vec!["~/docs/".to_string()]
    );
    assert!(complete_path_with("~/do", None).is_empty());
    assert!(complete_path_with("", None).is_empty());
    assert!(complete_path_with("no-separator", None).is_empty());
    assert!(complete_path_with("/non_existent_path_rsfiler_12345/a", None).is_empty());
    assert_eq!(
        complete_path("/non_existent_path_rsfiler_12345/a".into()).len(),
        0
    );
}

#[test]
fn test_complete_path_with_limits_results() {
    let dir = tempdir().unwrap();
    for i in 0..(MAX_COMPLETIONS + 5) {
        fs::create_dir(dir.path().join(format!("d{:04}", i))).unwrap();
    }
    let input = format!("{}/d", dir.path().display());
    assert_eq!(complete_path_with(&input, None).len(), MAX_COMPLETIONS);
}

#[test]
fn test_get_disk_space_success() {
    let dir = tempdir().unwrap();
    let space = get_disk_space(dir.path().to_string_lossy().into_owned()).unwrap();
    assert!(space.total > 0);
    assert!(space.free <= space.total);
}

#[test]
fn test_home_dir_string_success() {
    assert_eq!(
        home_dir_string(Some(PathBuf::from("/home/u"))).unwrap(),
        "/home/u"
    );
}

#[test]
fn test_home_dir_string_none_failure() {
    assert!(home_dir_string(None)
        .unwrap_err()
        .contains("ホームディレクトリ"));
}

#[test]
fn test_disk_space_of_failure() {
    let result = disk_space_of("/x", |_| Err(std::io::Error::other("boom")));
    assert_eq!(result.unwrap_err(), "boom");
}

#[test]
fn test_get_disk_space_missing_failure() {
    assert!(get_disk_space("/non_existent_path_rsfiler_12345".to_string()).is_err());
}

#[test]
fn test_drives_from_success() {
    let result = drives_from(vec!["A:/".to_string(), "C:/".to_string()], |p| p == "C:/");
    assert_eq!(result, vec!["C:/".to_string()]);
}

#[test]
fn test_candidate_roots_success() {
    let roots = candidate_roots();
    if cfg!(windows) {
        assert_eq!(roots.len(), 26);
        assert_eq!(roots[0], "A:/");
    } else {
        assert_eq!(roots, vec!["/".to_string()]);
    }
}
