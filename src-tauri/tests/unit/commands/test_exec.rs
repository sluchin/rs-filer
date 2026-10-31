//! `commands::exec` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `commands::exec` の子モジュール (`#[path]`) として組み込む.

use super::*;
use std::fs;
use tempfile::tempdir;

#[test]
fn test_build_command_with_placeholder() {
    assert_eq!(build_command("xdg-open %f", "REFS"), "xdg-open REFS");
    assert_eq!(build_command("diff %f | less", "REFS"), "diff REFS | less");
}

#[test]
fn test_build_command_without_placeholder_appends_paths() {
    assert_eq!(build_command("code", "REFS"), "code REFS");
}

#[cfg(not(windows))]
#[test]
fn test_path_refs_positional_parameters() {
    assert_eq!(path_refs(2), "\"$@\"");
}

#[cfg(windows)]
#[test]
fn test_path_refs_environment_variables() {
    assert_eq!(path_refs(2), "\"%RSFILER_PATH_1%\" \"%RSFILER_PATH_2%\"");
}

#[cfg(not(windows))]
#[test]
fn test_build_command_paths_are_not_interpreted_by_shell() {
    // シェルに解釈されうる名前のファイルも, そのままの名前で渡ること
    let dir = tempdir().unwrap();
    let names = [
        "a b",
        "$(touch injected)",
        "c;touch injected",
        "d'e\"f",
        "*",
    ];
    let paths: Vec<String> = names
        .iter()
        .map(|n| dir.path().join(n).to_string_lossy().into_owned())
        .collect();
    let out = dir.path().join("out");
    let command = format!("printf '%s\\n' %f > '{}'", out.display());

    let status = Command::new("sh")
        .current_dir(dir.path())
        .arg("-c")
        .arg(build_command(&command, &path_refs(paths.len())))
        .arg("sh")
        .args(&paths)
        .status()
        .unwrap();

    assert!(status.success());
    let printed = fs::read_to_string(&out).unwrap();
    assert_eq!(printed.lines().collect::<Vec<_>>(), paths);
    assert!(!dir.path().join("injected").exists());
}

#[test]
fn test_run_with_success() {
    let called = std::cell::RefCell::new(None);
    run_with("echo hi", &["/a".to_string()], &|cmd, paths| {
        *called.borrow_mut() = Some((cmd.to_string(), paths.to_vec()));
        true
    })
    .unwrap();
    assert_eq!(
        called.into_inner(),
        Some(("echo hi".to_string(), vec!["/a".to_string()]))
    );
}

#[test]
fn test_run_with_runner_failure() {
    let result = run_with("bad", &[], &|_, _| false);
    assert!(result.unwrap_err().contains("Failed to start command"));
}

#[test]
fn test_existing_paths_filters_missing() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("f");
    fs::write(&file, "x").unwrap();
    let missing = dir.path().join("none");

    let result = existing_paths(&[
        file.to_string_lossy().into_owned(),
        missing.to_string_lossy().into_owned(),
    ]);

    assert_eq!(result, vec![file.to_string_lossy().into_owned()]);
}

#[test]
fn test_run_external_command_success() {
    // テスト実行ファイル自身を「外部コマンド」として起動する
    // (フィルタは何にも一致しないので, すぐ終了する. open.rs の同種のテストと同じ手法).
    let dir = tempdir().unwrap();
    let file = dir.path().join("f.txt");
    fs::write(&file, "x").unwrap();
    let exe = std::env::current_exe().unwrap();
    let command = format!("\"{}\" --exact __rsfiler_no_such_test__", exe.display());

    let result = run_external_command(command, vec![file.to_string_lossy().into_owned()]);

    assert!(result.is_ok(), "{:?}", result.err());
}

#[test]
fn test_run_external_command_empty_command_failure() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("f.txt");
    fs::write(&file, "x").unwrap();
    assert_eq!(
        run_external_command(" ".to_string(), vec![file.to_string_lossy().into_owned()])
            .unwrap_err(),
        "Command is empty"
    );
}

#[test]
fn test_run_external_command_no_existing_targets_failure() {
    let dir = tempdir().unwrap();
    let missing = dir.path().join("none").to_string_lossy().into_owned();
    assert_eq!(
        run_external_command("echo".to_string(), vec![missing]).unwrap_err(),
        "No existing targets"
    );
}
