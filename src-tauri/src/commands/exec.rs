//! 選択したファイルに対する, 外部コマンドの実行.

use std::path::Path;
use std::process::Command;

/// シェルに渡す 1 つの引数を, 空白や特殊文字を含んでいても安全なように囲みます.
///
/// # Arguments
///
/// * `arg` - 対象の文字列.
///
/// # Returns
///
/// シェルの引用符で囲んだ文字列 (Windows では二重引用符, それ以外では単一引用符).
fn quote_shell_arg(arg: &str) -> String {
    if cfg!(windows) {
        format!("\"{}\"", arg.replace('"', "\"\""))
    } else {
        format!("'{}'", arg.replace('\'', "'\\''"))
    }
}

/// コマンドの文字列と対象のパスから, 実行するコマンド全体の文字列を組み立てます.
///
/// コマンドに `%f` が含まれる場合は, そのすべてを, 対象パスを空白区切りで並べたものに置き換えます.
/// 含まれない場合は, コマンドの末尾に対象パスを付け加えます.
///
/// # Arguments
///
/// * `command` - 入力されたコマンド (`%f` を含んでもよい).
/// * `paths` - 対象のパス. 空の場合はコマンドをそのまま返す.
///
/// # Returns
///
/// シェルで実行する, 組み立て済みのコマンド文字列.
fn build_command(command: &str, paths: &[String]) -> String {
    let joined = paths
        .iter()
        .map(|p| quote_shell_arg(p))
        .collect::<Vec<_>>()
        .join(" ");
    if paths.is_empty() {
        command.to_string()
    } else if command.contains("%f") {
        command.replace("%f", &joined)
    } else {
        format!("{} {}", command, joined)
    }
}

/// 組み立てたコマンドを, シェル経由で実行します. 完了を待たず, 起動できたかどうかだけ返します.
///
/// # Arguments
///
/// * `full_command` - 実行するコマンド全体の文字列.
/// * `runner` - 実際に起動する関数. 成功したら `true` を返す.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], コマンドが空の場合や起動に失敗した場合はエラー文字列を含む [`Err`].
fn run_with(full_command: &str, runner: &dyn Fn(&str) -> bool) -> Result<(), String> {
    if full_command.trim().is_empty() {
        return Err("Command is empty".to_string());
    }
    if runner(full_command) {
        Ok(())
    } else {
        Err(format!("Failed to start command: {}", full_command))
    }
}

/// シェル経由で, 実際にコマンドを起動します.
///
/// # Arguments
///
/// * `full_command` - 実行するコマンド全体の文字列.
///
/// # Returns
///
/// 起動できた場合は `true`.
#[cfg(not(tarpaulin_include))]
fn spawn_in_shell(full_command: &str) -> bool {
    if cfg!(windows) {
        Command::new("cmd").arg("/C").arg(full_command).spawn()
    } else {
        Command::new("sh").arg("-c").arg(full_command).spawn()
    }
    .is_ok()
}

/// 入力されたパスのうち, 実在するものだけを残します (削除済みなどを除くため).
///
/// # Arguments
///
/// * `paths` - 対象のパス.
///
/// # Returns
///
/// 実在するパスだけの一覧.
fn existing_paths(paths: &[String]) -> Vec<String> {
    paths
        .iter()
        .filter(|p| Path::new(p).exists())
        .cloned()
        .collect()
}

/// 選択したファイルまたはディレクトリに対して, 外部コマンドを実行します.
///
/// コマンドに `%f` を含めると, 対象のパス (複数はシェルの引用符付きで空白区切り) に置き換わります.
/// 含めない場合は, コマンドの末尾に対象のパスを付け加えます.
///
/// # Arguments
///
/// * `command` - 実行するコマンド.
/// * `paths` - 対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 対象が無い場合や起動に失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command]
pub fn run_external_command(command: String, paths: Vec<String>) -> Result<(), String> {
    let paths = existing_paths(&paths);
    if paths.is_empty() {
        return Err("No existing targets".to_string());
    }
    run_with(&build_command(&command, &paths), &spawn_in_shell)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_quote_shell_arg_success() {
        if cfg!(windows) {
            assert_eq!(quote_shell_arg(r#"a "b" c"#), r#""a ""b"" c""#);
        } else {
            assert_eq!(quote_shell_arg("a 'b' c"), r"'a '\''b'\'' c'");
        }
    }

    #[test]
    fn test_build_command_with_placeholder() {
        let result = build_command("xdg-open %f", &["/a b".to_string(), "/c".to_string()]);
        let expected = if cfg!(windows) {
            r#"xdg-open "/a b" "/c""#
        } else {
            r"xdg-open '/a b' '/c'"
        };
        assert_eq!(result, expected);
    }

    #[test]
    fn test_build_command_without_placeholder_appends_paths() {
        let result = build_command("code", &["/a".to_string()]);
        let expected = if cfg!(windows) {
            r#"code "/a""#
        } else {
            "code '/a'"
        };
        assert_eq!(result, expected);
    }

    #[test]
    fn test_build_command_no_paths_returns_as_is() {
        assert_eq!(build_command("ls", &[]), "ls");
    }

    #[test]
    fn test_run_with_success_and_empty_failure() {
        assert!(run_with("", &|_| panic!("呼ばれないこと")).is_err());
        let called = std::cell::RefCell::new(None);
        run_with("echo hi", &|cmd| {
            *called.borrow_mut() = Some(cmd.to_string());
            true
        })
        .unwrap();
        assert_eq!(called.borrow().as_deref(), Some("echo hi"));
    }

    #[test]
    fn test_run_with_runner_failure() {
        let result = run_with("bad", &|_| false);
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
        let command = format!(
            "{} --exact __rsfiler_no_such_test__",
            quote_shell_arg(exe.to_str().unwrap())
        );

        let result = run_external_command(command, vec![file.to_string_lossy().into_owned()]);

        assert!(result.is_ok(), "{:?}", result.err());
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
}
