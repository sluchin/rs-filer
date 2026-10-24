//! ファイルを関連付けられたアプリケーションまたはエディタで開く, およびターミナルを開くコマンド.

use super::config::load_config_from;
use std::path::Path;
use std::process::Command;

/// OS の関連付けられたアプリケーションでパスを開きます.
///
/// # Arguments
///
/// * `path` - 開く対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
// OS の関連付けで, 実際にアプリケーションを起動するため, カバレッジの対象外にする.
#[cfg(not(tarpaulin_include))]
fn system_open(path: &Path) -> Result<(), String> {
    open::that(path).map_err(|e| e.to_string())
}

/// 対象の存在を確認してから, 渡された `opener` でパスを開きます.
///
/// # Arguments
///
/// * `path` - 開く対象のパス.
/// * `opener` - パスを開く関数.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 対象が存在しない場合や起動に失敗した場合はエラー文字列を含む [`Err`].
fn open_with(path: &Path, opener: impl FnOnce(&Path) -> Result<(), String>) -> Result<(), String> {
    if !path.exists() {
        let message = format!("Path does not exist: {}", path.display());
        log::error!("{}", message);
        return Err(message);
    }
    match opener(path) {
        Ok(()) => {
            log::info!("開く: {}", path.display());
            Ok(())
        }
        Err(e) => {
            log::error!("開く失敗: {} ({})", path.display(), e);
            Err(e)
        }
    }
}

/// 関連付けられた外部アプリケーションでファイルまたはディレクトリを開きます.
///
/// # Arguments
///
/// * `path` - 開く対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command]
#[specta::specta]
pub fn open_item(path: String) -> Result<(), String> {
    open_with(Path::new(&path), system_open)
}

/// 指定したエディタでファイルを開きます. エディタが未指定の場合は OS の既定のアプリケーションを使います.
///
/// # Arguments
///
/// * `path` - 開く対象のパス.
/// * `editor` - エディタのコマンド名. `None` または空文字の場合は既定のアプリケーション.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 対象が存在しない場合やエディタの起動に失敗した場合は
/// エラー文字列を含む [`Err`].
fn open_in_editor_with(path: &Path, editor: Option<&str>) -> Result<(), String> {
    match editor.map(str::trim).filter(|e| !e.is_empty()) {
        Some(cmd) => open_with(path, |p| {
            Command::new(cmd)
                .arg(p)
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to start editor '{}': {}", cmd, e))
        }),
        None => open_with(path, system_open),
    }
}

/// 使うエディタを決めます.
///
/// 設定 (`config.json`) の `editor`, 環境変数 `VISUAL`, 環境変数 `EDITOR` の順に探します.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
/// * `env` - 環境変数を読む関数.
///
/// # Returns
///
/// エディタのコマンド名. いずれも未設定の場合は `None`. 設定を読み込めない場合はエラー文字列を含む [`Err`].
fn resolve_editor(
    config_dir: Option<&Path>,
    env: &dyn Fn(&str) -> Option<String>,
) -> Result<Option<String>, String> {
    let config_editor = load_config_from(config_dir)?.editor;
    Ok(config_editor
        .or_else(|| env("VISUAL"))
        .or_else(|| env("EDITOR")))
}

/// エディタでファイルを開きます.
///
/// エディタは, 設定 (`config.json`) の `editor`, 環境変数 `VISUAL`, 環境変数 `EDITOR` の順に探します.
/// いずれも未設定の場合は OS の既定のアプリケーションで開きます.
///
/// # Arguments
///
/// * `path` - 開く対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定と環境変数を読み, エディタを起動するため, カバレッジの対象外にする
// (処理は resolve_editor と open_in_editor_with で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub fn open_in_editor(path: String) -> Result<(), String> {
    let editor = resolve_editor(dirs::config_dir().as_deref(), &|name| {
        std::env::var(name).ok()
    })?;
    open_in_editor_with(Path::new(&path), editor.as_deref())
}

/// 現在の OS で試す, ターミナルの候補 (プログラム名, 追加の引数). Windows.
///
/// 先頭から順に起動を試み, 最初に成功したもので処理を終えます.
#[cfg(target_os = "windows")]
fn terminal_candidates() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![("cmd", vec!["/C", "start", "cmd"])]
}

/// 現在の OS で試す, ターミナルの候補 (プログラム名, 追加の引数). macOS.
///
/// 先頭から順に起動を試み, 最初に成功したもので処理を終えます.
#[cfg(target_os = "macos")]
fn terminal_candidates() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![("open", vec!["-a", "Terminal"])]
}

/// 現在の OS で試す, ターミナルの候補 (プログラム名, 追加の引数). Windows と macOS 以外.
///
/// 先頭から順に起動を試み, 最初に成功したもので処理を終えます.
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn terminal_candidates() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![
        ("x-terminal-emulator", vec![]),
        ("gnome-terminal", vec![]),
        ("konsole", vec![]),
        ("xfce4-terminal", vec![]),
        ("xterm", vec![]),
    ]
}

/// ターミナルを開くコマンドの候補を返します. 設定で指定されていれば, それだけを候補にします.
///
/// # Arguments
///
/// * `configured` - 設定 (`config.json`) の `terminal`. 空文字や空白のみの場合は無指定として扱う.
///
/// # Returns
///
/// (プログラム名, 追加の引数) の候補一覧.
fn candidates_for(configured: Option<&str>) -> Vec<(String, Vec<String>)> {
    match configured.map(str::trim).filter(|s| !s.is_empty()) {
        Some(cmd) => vec![(cmd.to_string(), Vec::new())],
        None => terminal_candidates()
            .into_iter()
            .map(|(program, args)| {
                (
                    program.to_string(),
                    args.into_iter().map(String::from).collect(),
                )
            })
            .collect(),
    }
}

/// カレントディレクトリでターミナルを開く実処理. 候補を順に `spawner` で起動します.
///
/// # Arguments
///
/// * `dir` - ターミナルの作業ディレクトリにするパス.
/// * `candidates` - 試す (プログラム名, 追加の引数) の一覧.
/// * `spawner` - 実際に起動する関数. 成功したら `true` を返す.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], `dir` がディレクトリでない場合やすべての候補が失敗した場合は
/// エラー文字列を含む [`Err`].
fn open_terminal_with(
    dir: &Path,
    candidates: &[(String, Vec<String>)],
    spawner: &dyn Fn(&str, &[String], &Path) -> bool,
) -> Result<(), String> {
    if !dir.is_dir() {
        let message = format!("Not a directory: {}", dir.display());
        log::error!("{}", message);
        return Err(message);
    }
    if candidates
        .iter()
        .any(|(program, args)| spawner(program, args, dir))
    {
        log::info!("ターミナルを開く: {}", dir.display());
        Ok(())
    } else {
        let message = "Failed to start a terminal".to_string();
        log::error!("{} ({})", message, dir.display());
        Err(message)
    }
}

/// プログラムを, 指定した作業ディレクトリで起動します (終了は待ちません).
///
/// # Arguments
///
/// * `program` - 起動するプログラム.
/// * `args` - 追加の引数.
/// * `dir` - 作業ディレクトリ.
///
/// # Returns
///
/// 起動できた場合は `true`.
fn spawn_in(program: &str, args: &[String], dir: &Path) -> bool {
    Command::new(program)
        .args(args)
        .current_dir(dir)
        .spawn()
        .is_ok()
}

/// カレントディレクトリでターミナルを開きます.
///
/// 設定 (`config.json`) の `terminal` があればそれを, 無ければ OS ごとの既定のターミナルを
/// 順に試します.
///
/// # Arguments
///
/// * `path` - ターミナルの作業ディレクトリにするパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定を読み, ターミナルを起動するため, カバレッジの対象外にする
// (処理は candidates_for, open_terminal_with, spawn_in で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub fn open_terminal(path: String) -> Result<(), String> {
    let terminal = load_config_from(dirs::config_dir().as_deref())?.terminal;
    open_terminal_with(
        Path::new(&path),
        &candidates_for(terminal.as_deref()),
        &spawn_in,
    )
}

#[cfg(test)]
#[path = "../../tests/unit/commands/open_test.rs"]
mod tests;
