//! ファイルを関連付けられたアプリケーションまたはエディタで開くコマンド.

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
        return Err(format!("Path does not exist: {}", path.display()));
    }
    opener(path)
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

/// 環境変数 `VISUAL` または `EDITOR` のエディタでファイルを開きます.
///
/// どちらも未設定の場合は OS の既定のアプリケーションで開きます.
///
/// # Arguments
///
/// * `path` - 開く対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command]
pub fn open_in_editor(path: String) -> Result<(), String> {
    let editor = std::env::var("VISUAL")
        .or_else(|_| std::env::var("EDITOR"))
        .ok();
    open_in_editor_with(Path::new(&path), editor.as_deref())
}

#[cfg(test)]
mod tests {
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
}
