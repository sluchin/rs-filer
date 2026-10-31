//! `commands::open` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `commands::open` の子モジュール (`#[path]`) として組み込む.

use super::super::config::{save_config_to, AppConfig};
use super::*;
use std::fs;
use tempfile::tempdir;

#[test]
fn test_open_with_success() {
    let dir = tempdir().unwrap();
    let mut opened = None;
    open_with(dir.path(), |p| {
        opened = Some(p.to_path_buf());
        Ok(())
    })
    .unwrap();
    assert_eq!(opened.as_deref(), Some(dir.path()));
}

#[test]
fn test_open_with_missing_failure() {
    let dir = tempdir().unwrap();
    let result = open_with(&dir.path().join("none"), |_| panic!("呼ばれないこと"));
    assert!(result.unwrap_err().contains("does not exist"));
}

#[test]
fn test_open_in_editor_with_editor_success() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("f.txt");
    fs::write(&file, "x").unwrap();
    // テスト実行ファイル自身を「エディタ」として起動する (引数はテスト名フィルタとして扱われ, すぐ終了する)
    let exe = std::env::current_exe().unwrap();
    open_in_editor_with(&file, Some(exe.to_str().unwrap())).unwrap();
}

#[test]
fn test_open_in_editor_with_editor_failure() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("f.txt");
    fs::write(&file, "x").unwrap();
    let result = open_in_editor_with(&file, Some("rsfiler-no-such-editor"));
    assert!(result.unwrap_err().contains("Failed to start editor"));
}

#[test]
fn test_open_in_editor_with_default_app_failure() {
    // エディタ未指定 (空文字を含む) の場合は既定のアプリ経路になる. 対象が無いので起動前にエラーになる
    let dir = tempdir().unwrap();
    let missing = dir.path().join("none");
    for editor in [None, Some("  ")] {
        let result = open_in_editor_with(&missing, editor);
        assert!(result.unwrap_err().contains("does not exist"));
    }
}

#[test]
fn test_candidates_for_success() {
    // 設定があれば, それだけを候補にする.
    assert_eq!(
        candidates_for(Some(" kitty ")),
        vec![("kitty".to_string(), Vec::new())]
    );
    // 無い (空白だけを含む) 場合は, OS ごとの既定の候補.
    for configured in [None, Some("  ")] {
        let candidates = candidates_for(configured);
        assert_eq!(candidates.len(), terminal_candidates().len());
        assert!(!candidates.is_empty());
    }
}

#[test]
fn test_open_terminal_with_success() {
    let dir = tempdir().unwrap();
    let candidates = vec![
        ("first".to_string(), Vec::new()),
        ("second".to_string(), vec!["-x".to_string()]),
    ];
    let tried = std::cell::RefCell::new(Vec::new());

    let result = open_terminal_with(dir.path(), &candidates, &|program, args, cwd| {
        tried.borrow_mut().push(program.to_string());
        assert_eq!(cwd, dir.path());
        // 2 つ目で起動できたとする.
        !args.is_empty()
    });

    assert!(result.is_ok());
    assert_eq!(*tried.borrow(), vec!["first", "second"]);
}

#[test]
fn test_open_terminal_with_failure() {
    let dir = tempdir().unwrap();
    let candidates = vec![("none".to_string(), Vec::new())];

    let all_failed = open_terminal_with(dir.path(), &candidates, &|_, _, _| false);
    assert_eq!(all_failed.unwrap_err(), "Failed to start a terminal");

    let not_dir = open_terminal_with(&dir.path().join("none"), &candidates, &|_, _, _| {
        panic!("呼ばれないこと")
    });
    assert!(not_dir.unwrap_err().starts_with("Not a directory"));
}

#[test]
fn test_resolve_editor_order() {
    let env = |name: &str| match name {
        "VISUAL" => Some("visual-editor".to_string()),
        "EDITOR" => Some("editor".to_string()),
        _ => None,
    };
    // 設定が無ければ, VISUAL, EDITOR の順.
    let dir = tempdir().unwrap();
    assert_eq!(
        resolve_editor(Some(dir.path()), &env).unwrap().as_deref(),
        Some("visual-editor")
    );
    let only_editor = |name: &str| (name == "EDITOR").then(|| "editor".to_string());
    assert_eq!(
        resolve_editor(Some(dir.path()), &only_editor)
            .unwrap()
            .as_deref(),
        Some("editor")
    );
    assert_eq!(resolve_editor(None, &|_| None).unwrap(), None);

    // 設定があれば, 環境変数より優先する.
    let config = AppConfig {
        editor: Some("configured".to_string()),
        ..Default::default()
    };
    save_config_to(Some(dir.path()), &config).unwrap();
    assert_eq!(
        resolve_editor(Some(dir.path()), &env).unwrap().as_deref(),
        Some("configured")
    );
}

#[test]
fn test_resolve_editor_broken_config_failure() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("rsfiler").join("config.json");
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, "{ broken").unwrap();
    assert!(resolve_editor(Some(dir.path()), &|_| None).is_err());
}

#[test]
fn test_spawn_in_success_and_failure() {
    let dir = tempdir().unwrap();
    // テスト実行ファイル自身を起動する (引数はテスト名フィルタとして扱われ, すぐ終了する).
    let exe = std::env::current_exe().unwrap();
    assert!(spawn_in(
        exe.to_str().unwrap(),
        &["rsfiler_no_such_test".to_string()],
        dir.path()
    ));
    assert!(!spawn_in("rsfiler-no-such-terminal", &[], dir.path()));
}
