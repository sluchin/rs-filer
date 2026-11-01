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

#[cfg(unix)]
#[test]
fn test_scan_directory_follows_symlinks() {
    let dir = tempdir().unwrap();
    fs::create_dir(dir.path().join("target_dir")).unwrap();
    fs::write(dir.path().join("target.txt"), "hello").unwrap();
    std::os::unix::fs::symlink(dir.path().join("target_dir"), dir.path().join("link_dir")).unwrap();
    std::os::unix::fs::symlink(dir.path().join("target.txt"), dir.path().join("link.txt")).unwrap();
    std::os::unix::fs::symlink(dir.path().join("none"), dir.path().join("dangling")).unwrap();

    let files = scan_directory(&dir.path().to_string_lossy()).unwrap();
    let get = |n: &str| files.iter().find(|f| f.name == n).unwrap();

    assert!(get("link_dir").is_dir);
    assert!(!get("link.txt").is_dir);
    assert_eq!(get("link.txt").size, 5);
    // リンク先が無いリンクも, リンク自身の情報で一覧に出す.
    assert!(!get("dangling").is_dir);
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

/// 再帰検索の確認用に, ディレクトリの木を作る.
fn search_fixture() -> tempfile::TempDir {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("sub/deep")).unwrap();
    fs::create_dir(dir.path().join(".git")).unwrap();
    fs::write(dir.path().join("Readme.md"), "r").unwrap();
    fs::write(dir.path().join("sub/note.txt"), "note").unwrap();
    fs::write(dir.path().join("sub/deep/NOTE2.txt"), "n2").unwrap();
    fs::write(dir.path().join(".git/note.cfg"), "").unwrap();
    fs::write(dir.path().join(".note"), "").unwrap();
    dir
}

/// 結果の名前を, 並べて返す.
fn search_names(result: &SearchResult) -> Vec<String> {
    let mut names: Vec<String> = result.entries.iter().map(|e| e.name.clone()).collect();
    names.sort();
    names
}

#[test]
fn test_search_tree_matches_names_in_subdirectories() {
    let dir = search_fixture();
    let root = dir.path().to_string_lossy().into_owned();
    let result = search_tree(&root, "note", false, 100).unwrap();
    // 大文字小文字を区別せず, 相対パス (`/` 区切り) で返す. 隠しファイルと隠しディレクトリの中は除く.
    assert_eq!(
        search_names(&result),
        ["sub/deep/NOTE2.txt", "sub/note.txt"]
    );
    assert!(!result.truncated);
    let found = result
        .entries
        .iter()
        .find(|e| e.name == "sub/note.txt")
        .unwrap();
    assert_eq!(
        found.path,
        dir.path().join("sub/note.txt").to_string_lossy()
    );
    assert!(!found.is_dir);
    assert_eq!(found.size, 4);
    assert!(found.modified.is_some());
}

#[test]
fn test_search_tree_finds_directories_and_hidden_when_asked() {
    let dir = search_fixture();
    let root = dir.path().to_string_lossy().into_owned();
    let result = search_tree(&root, "deep", false, 100).unwrap();
    assert_eq!(search_names(&result), ["sub/deep"]);
    assert!(result.entries[0].is_dir);

    let result = search_tree(&root, "note", true, 100).unwrap();
    assert_eq!(
        search_names(&result),
        [
            ".git/note.cfg",
            ".note",
            "sub/deep/NOTE2.txt",
            "sub/note.txt"
        ]
    );
    assert!(result.entries.iter().any(|e| e.name == ".note" && e.hidden));
}

#[test]
fn test_search_tree_empty_query_matches_everything_and_truncates() {
    let dir = search_fixture();
    let root = dir.path().to_string_lossy().into_owned();
    let all = search_tree(&root, "", false, 100).unwrap();
    assert_eq!(all.entries.len(), 5);
    assert!(!all.truncated);
    // 上限に達したら, そこで打ち切る (ちょうど上限の件数なら打ち切らない)
    let cut = search_tree(&root, "", false, 2).unwrap();
    assert_eq!(cut.entries.len(), 2);
    assert!(cut.truncated);
    let exact = search_tree(&root, "", false, 5).unwrap();
    assert_eq!(exact.entries.len(), 5);
    assert!(!exact.truncated);
}

#[test]
fn test_search_tree_lists_shallow_entries_first() {
    let dir = search_fixture();
    let root = dir.path().to_string_lossy().into_owned();
    let result = search_tree(&root, "", false, 100).unwrap();
    let depth = |e: &FileEntry| e.name.matches('/').count();
    let depths: Vec<usize> = result.entries.iter().map(depth).collect();
    assert!(depths.windows(2).all(|w| w[0] <= w[1]), "{depths:?}");
}

#[test]
fn test_search_tree_missing_root_is_an_error() {
    let dir = tempdir().unwrap();
    let missing = dir.path().join("none").to_string_lossy().into_owned();
    assert!(search_tree(&missing, "a", false, 10).is_err());
}

#[cfg(unix)]
#[test]
fn test_search_tree_does_not_follow_symlinks_and_skips_unreadable() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempdir().unwrap();
    fs::create_dir(dir.path().join("real")).unwrap();
    fs::write(dir.path().join("real/file.txt"), "").unwrap();
    // 自分を指すリンク: 項目としては出るが, 中には入らない (入ると終わらない)
    std::os::unix::fs::symlink(dir.path(), dir.path().join("loop")).unwrap();
    fs::create_dir(dir.path().join("locked")).unwrap();
    fs::write(dir.path().join("locked/secret.txt"), "").unwrap();
    fs::set_permissions(dir.path().join("locked"), fs::Permissions::from_mode(0o000)).unwrap();

    let root = dir.path().to_string_lossy().into_owned();
    let result = search_tree(&root, "", false, 100).unwrap();
    fs::set_permissions(dir.path().join("locked"), fs::Permissions::from_mode(0o755)).unwrap();

    let names = search_names(&result);
    assert!(names.contains(&"loop".to_string()));
    assert!(names.contains(&"real/file.txt".to_string()));
    assert!(!names.iter().any(|n| n.starts_with("loop/")));
    // 読めないディレクトリ自体は出るが, 中は飛ばす
    assert!(names.contains(&"locked".to_string()));
    assert!(!names.contains(&"locked/secret.txt".to_string()));
}

#[test]
fn test_search_directory_async_success_and_failure() {
    let dir = search_fixture();
    let root = dir.path().to_string_lossy().into_owned();
    let result = tauri::async_runtime::block_on(search_directory(
        root.clone(),
        "note".to_string(),
        false,
        1,
    ))
    .unwrap();
    assert_eq!(result.entries.len(), 1);
    assert!(result.truncated);

    let missing = dir.path().join("none").to_string_lossy().into_owned();
    let error =
        tauri::async_runtime::block_on(search_directory(missing, "a".to_string(), false, 10))
            .unwrap_err();
    assert!(!error.is_empty());
}

#[test]
fn test_name_matches_substring_and_wildcards() {
    // ワイルドカードが無ければ, 名前の一部 (大文字小文字は区別しない)
    assert!(name_matches("note", "MyNotes.txt"));
    assert!(!name_matches("note", "readme.md"));
    assert!(name_matches("", "anything"));
    // ワイルドカードがあれば, 名前の全体に合うかを見る
    assert!(name_matches("*.TXT", "a.txt"));
    assert!(!name_matches("*.txt", "a.txt.bak"));
    assert!(name_matches("n?te*", "Notes.md"));
    assert!(!name_matches("n?te", "nte"));
    assert!(name_matches("*", ""));
    assert!(name_matches("a*b*c", "aXXbYYc"));
    assert!(!name_matches("a*b*c", "aXXbYY"));
    assert!(!name_matches("?", ""));
}

#[test]
fn test_search_tree_wildcard_matches_whole_names_in_subdirectories() {
    let dir = search_fixture();
    let root = dir.path().to_string_lossy().into_owned();
    let result = search_tree(&root, "*.txt", false, 100).unwrap();
    assert_eq!(
        search_names(&result),
        ["sub/deep/NOTE2.txt", "sub/note.txt"]
    );
    let result = search_tree(&root, "note.*", false, 100).unwrap();
    assert_eq!(search_names(&result), ["sub/note.txt"]);
}

/// 中身の検索の確認用に, ファイルの木を作る.
fn grep_fixture() -> tempfile::TempDir {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("sub")).unwrap();
    fs::create_dir(dir.path().join(".git")).unwrap();
    fs::write(dir.path().join("a.txt"), "hello world\nTODO: fix\n").unwrap();
    fs::write(dir.path().join("b.txt"), "nothing here\n").unwrap();
    fs::write(dir.path().join("sub/c.rs"), "// todo later\nfn main() {}\n").unwrap();
    fs::write(dir.path().join(".git/d.txt"), "TODO hidden\n").unwrap();
    fs::write(dir.path().join(".env"), "TODO secret\n").unwrap();
    // 先頭に NUL バイトがあるものは, バイナリとして飛ばす
    fs::write(dir.path().join("bin.dat"), b"\0TODO\0").unwrap();
    dir
}

#[test]
fn test_grep_tree_finds_files_by_content() {
    let dir = grep_fixture();
    let root = dir.path().to_string_lossy().into_owned();
    // 大文字小文字は区別する. ディレクトリは出ない. 隠しファイルと隠しディレクトリの中は除く. バイナリは飛ばす.
    let result = grep_tree(&root, "TODO", false, 100).unwrap();
    assert_eq!(search_names(&result), ["a.txt"]);
    assert!(!result.truncated);
    // (?i) で区別しなくなる. 正規表現が使える.
    let result = grep_tree(&root, "(?i)todo", false, 100).unwrap();
    assert_eq!(search_names(&result), ["a.txt", "sub/c.rs"]);
    let result = grep_tree(&root, r"(?m)^fn \w+\(\)", false, 100).unwrap();
    assert_eq!(search_names(&result), ["sub/c.rs"]);
    let found = &result.entries[0];
    assert_eq!(found.path, dir.path().join("sub/c.rs").to_string_lossy());
    assert!(!found.is_dir);
}

#[test]
fn test_grep_tree_hidden_truncation_and_errors() {
    let dir = grep_fixture();
    let root = dir.path().to_string_lossy().into_owned();
    let result = grep_tree(&root, "TODO", true, 100).unwrap();
    assert_eq!(search_names(&result), [".env", ".git/d.txt", "a.txt"]);
    let cut = grep_tree(&root, "TODO", true, 2).unwrap();
    assert_eq!(cut.entries.len(), 2);
    assert!(cut.truncated);

    // 不正な正規表現と, 読めないディレクトリは, エラーにする
    assert!(grep_tree(&root, "(", false, 10).is_err());
    let missing = dir.path().join("none").to_string_lossy().into_owned();
    assert!(grep_tree(&missing, "a", false, 10).is_err());
}

#[test]
fn test_grep_tree_skips_large_files() {
    let dir = tempdir().unwrap();
    // 上限ちょうどは調べ, 1 バイト超えたら飛ばす
    let limit = GREP_MAX_FILE_SIZE as usize;
    let mut exact = vec![b'x'; limit];
    exact[..4].copy_from_slice(b"HIT ");
    fs::write(dir.path().join("exact.txt"), &exact).unwrap();
    let mut over = vec![b'x'; limit + 1];
    over[..4].copy_from_slice(b"HIT ");
    fs::write(dir.path().join("over.txt"), &over).unwrap();

    let root = dir.path().to_string_lossy().into_owned();
    let result = grep_tree(&root, "HIT", false, 10).unwrap();
    assert_eq!(search_names(&result), ["exact.txt"]);
}

#[cfg(unix)]
#[test]
fn test_grep_tree_skips_unreadable_files() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("ok.txt"), "HIT").unwrap();
    fs::write(dir.path().join("locked.txt"), "HIT").unwrap();
    fs::set_permissions(
        dir.path().join("locked.txt"),
        fs::Permissions::from_mode(0o000),
    )
    .unwrap();
    // リンク先が無いリンクは, 大きさを調べられないので飛ばす
    std::os::unix::fs::symlink(dir.path().join("none"), dir.path().join("dangling")).unwrap();

    let root = dir.path().to_string_lossy().into_owned();
    let result = grep_tree(&root, "HIT", false, 10).unwrap();
    fs::set_permissions(
        dir.path().join("locked.txt"),
        fs::Permissions::from_mode(0o644),
    )
    .unwrap();
    assert_eq!(search_names(&result), ["ok.txt"]);
}

#[test]
fn test_search_contents_async_success_and_failure() {
    let dir = grep_fixture();
    let root = dir.path().to_string_lossy().into_owned();
    let result = tauri::async_runtime::block_on(search_contents(
        root.clone(),
        "(?i)todo".to_string(),
        false,
        1,
    ))
    .unwrap();
    assert_eq!(result.entries.len(), 1);
    assert!(result.truncated);

    let error = tauri::async_runtime::block_on(search_contents(root, "(".to_string(), false, 10))
        .unwrap_err();
    assert!(!error.is_empty());
}
