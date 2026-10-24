//! 選択したファイルに対する, 外部コマンドの実行.
//!
//! コマンドはシェル (`sh -c` / `cmd /C`) で実行します (パイプやリダイレクトを使えるように). 対象のパスは,
//! コマンドの文字列に埋め込まず, シェルの位置引数 (`"$@"`) や環境変数 (`%RSFILER_PATH_1%`) で渡します.
//! ファイル名に `$`, `;`, `%` などが含まれていても, シェルに解釈されません.

use std::path::Path;
use std::process::Command;

/// Windows で, 対象のパスを渡す環境変数の名前の始め (`RSFILER_PATH_1`, `RSFILER_PATH_2`, ...).
#[cfg(windows)]
const PATH_VAR: &str = "RSFILER_PATH_";

/// シェルのコマンドの中で, 対象のパスを参照する文字列を返します.
///
/// # Arguments
///
/// * `_count` - 対象のパスの数.
///
/// # Returns
///
/// 全ての位置引数 (`"$@"`).
#[cfg(not(windows))]
fn path_refs(_count: usize) -> String {
    "\"$@\"".to_string()
}

/// シェルのコマンドの中で, 対象のパスを参照する文字列を返します.
///
/// # Arguments
///
/// * `count` - 対象のパスの数.
///
/// # Returns
///
/// 環境変数を二重引用符で囲み, 空白区切りで並べたもの (`"%RSFILER_PATH_1%" "%RSFILER_PATH_2%"`).
/// Windows のファイル名には `"` を使えないので, 囲みから抜け出せない.
#[cfg(windows)]
fn path_refs(count: usize) -> String {
    (1..=count)
        .map(|i| format!("\"%{PATH_VAR}{i}%\""))
        .collect::<Vec<_>>()
        .join(" ")
}

/// コマンドの文字列と, 対象のパスを参照する文字列から, 実行するコマンド全体の文字列を組み立てます.
///
/// コマンドに `%f` が含まれる場合は, そのすべてを, 対象のパスの参照に置き換えます.
/// 含まれない場合は, コマンドの末尾に対象のパスの参照を付け加えます.
///
/// # Arguments
///
/// * `command` - 入力されたコマンド (`%f` を含んでもよい).
/// * `refs` - 対象のパスを参照する文字列 ([`path_refs`]).
///
/// # Returns
///
/// シェルで実行する, 組み立て済みのコマンド文字列.
fn build_command(command: &str, refs: &str) -> String {
    if command.contains("%f") {
        command.replace("%f", refs)
    } else {
        format!("{} {}", command, refs)
    }
}

/// 組み立てたコマンドを, シェル経由で実行します. 完了を待たず, 起動できたかどうかだけ返します.
///
/// # Arguments
///
/// * `full_command` - 実行するコマンド全体の文字列.
/// * `paths` - 対象のパス.
/// * `runner` - 実際に起動する関数. 成功したら `true` を返す.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 起動に失敗した場合はエラー文字列を含む [`Err`].
fn run_with(
    full_command: &str,
    paths: &[String],
    runner: &dyn Fn(&str, &[String]) -> bool,
) -> Result<(), String> {
    if runner(full_command, paths) {
        log::info!("外部コマンド実行: {} {:?}", full_command, paths);
        Ok(())
    } else {
        let message = format!("Failed to start command: {}", full_command);
        log::error!("{}", message);
        Err(message)
    }
}

/// シェル経由で, 実際にコマンドを起動します. 対象のパスは, シェルの位置引数で渡します.
///
/// # Arguments
///
/// * `full_command` - 実行するコマンド全体の文字列.
/// * `paths` - 対象のパス.
///
/// # Returns
///
/// 起動できた場合は `true`.
#[cfg(not(any(windows, tarpaulin_include)))]
fn spawn_in_shell(full_command: &str, paths: &[String]) -> bool {
    // `sh -c` の後の 1 つ目の引数は `$0` (シェルの名前) になり, 残りが `"$@"` になる
    Command::new("sh")
        .arg("-c")
        .arg(full_command)
        .arg("sh")
        .args(paths)
        .spawn()
        .is_ok()
}

/// シェル経由で, 実際にコマンドを起動します. 対象のパスは, 環境変数で渡します.
///
/// # Arguments
///
/// * `full_command` - 実行するコマンド全体の文字列.
/// * `paths` - 対象のパス.
///
/// # Returns
///
/// 起動できた場合は `true`.
#[cfg(all(windows, not(tarpaulin_include)))]
fn spawn_in_shell(full_command: &str, paths: &[String]) -> bool {
    Command::new("cmd")
        .arg("/C")
        .arg(full_command)
        .envs(
            paths
                .iter()
                .enumerate()
                .map(|(i, path)| (format!("{PATH_VAR}{}", i + 1), path)),
        )
        .spawn()
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
/// コマンドに `%f` を含めると, 対象のパス (複数は空白区切り) に置き換わります.
/// 含めない場合は, コマンドの末尾に対象のパスを付け加えます. パスはシェルに解釈されません.
///
/// # Arguments
///
/// * `command` - 実行するコマンド.
/// * `paths` - 対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], コマンドが空の場合, 対象が無い場合, 起動に失敗した場合は
/// エラー文字列を含む [`Err`].
#[tauri::command]
#[specta::specta]
pub fn run_external_command(command: String, paths: Vec<String>) -> Result<(), String> {
    if command.trim().is_empty() {
        let message = "Command is empty".to_string();
        log::error!("{}", message);
        return Err(message);
    }
    let paths = existing_paths(&paths);
    if paths.is_empty() {
        let message = "No existing targets".to_string();
        log::error!("{}", message);
        return Err(message);
    }
    run_with(
        &build_command(&command, &path_refs(paths.len())),
        &paths,
        &spawn_in_shell,
    )
}

#[cfg(test)]
#[path = "../../tests/unit/commands/exec_test.rs"]
mod tests;
