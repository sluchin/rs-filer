//! 設定ファイルを読み込むコマンド.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// キーマップ設定ファイルのファイル名.
const KEYMAP_FILE: &str = "keymap.json";

/// キーマップ設定ファイルのパスを返します.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ.
///
/// # Returns
///
/// `<設定ディレクトリ>/rsfiler/keymap.json`.
fn keymap_path(config_dir: &Path) -> PathBuf {
    config_dir.join("rsfiler").join(KEYMAP_FILE)
}

/// キーマップ設定ファイルを読み込みます.
///
/// ファイルは, キーの並び (`"C-x C-f"`) から, コマンド名への対応を表す JSON のオブジェクトです.
/// 値を `null` にすると, そのキーの割り当てを解除します.
///
/// # Arguments
///
/// * `path` - 設定ファイルのパス.
///
/// # Returns
///
/// 割り当ての一覧. ファイルが無い場合は空. 読み込めない場合や JSON の形式が不正な場合は,
/// エラー文字列を含む [`Err`].
fn read_keymap(path: &Path) -> Result<HashMap<String, Option<String>>, String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(HashMap::new()),
        Err(e) => return Err(format!("Failed to read {}: {}", path.display(), e)),
    };
    serde_json::from_str(&text).map_err(|e| format!("Invalid {}: {}", path.display(), e))
}

/// 設定ディレクトリからキーマップ設定を読み込みます.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
///
/// # Returns
///
/// 割り当ての一覧. 設定ディレクトリが無い場合やファイルが無い場合は空.
/// 失敗した場合はエラー文字列を含む [`Err`].
fn load_keymap_from(config_dir: Option<&Path>) -> Result<HashMap<String, Option<String>>, String> {
    match config_dir {
        Some(dir) => read_keymap(&keymap_path(dir)),
        None => Ok(HashMap::new()),
    }
}

/// ユーザーのキーマップ設定を読み込みます.
///
/// # Returns
///
/// 割り当ての一覧. 設定ファイルが無い場合は空. 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリを読むため, カバレッジの対象外にする (ロジックは load_keymap_from で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
pub fn load_keymap() -> Result<HashMap<String, Option<String>>, String> {
    load_keymap_from(dirs::config_dir().as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_keymap_path_success() {
        assert_eq!(
            keymap_path(Path::new("/cfg")),
            Path::new("/cfg/rsfiler/keymap.json")
        );
    }

    #[test]
    fn test_read_keymap_success() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("keymap.json");
        fs::write(&file, r#"{"C-x C-f": "touch", "q": null}"#).unwrap();

        let keymap = read_keymap(&file).unwrap();

        assert_eq!(keymap["C-x C-f"], Some("touch".to_string()));
        assert_eq!(keymap["q"], None);
    }

    #[test]
    fn test_read_keymap_missing_file_is_empty() {
        let dir = tempdir().unwrap();
        assert!(read_keymap(&dir.path().join("none.json"))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn test_read_keymap_invalid_failure() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("keymap.json");
        fs::write(&file, "not json").unwrap();
        assert!(read_keymap(&file).unwrap_err().starts_with("Invalid"));
        fs::write(&file, r#"{"a": 1}"#).unwrap();
        assert!(read_keymap(&file).is_err());
    }

    #[test]
    fn test_read_keymap_unreadable_failure() {
        let dir = tempdir().unwrap();
        assert!(read_keymap(dir.path())
            .unwrap_err()
            .starts_with("Failed to read"));
    }

    #[test]
    fn test_load_keymap_from_success() {
        let dir = tempdir().unwrap();
        assert!(load_keymap_from(None).unwrap().is_empty());
        assert!(load_keymap_from(Some(dir.path())).unwrap().is_empty());

        fs::create_dir(dir.path().join("rsfiler")).unwrap();
        fs::write(
            dir.path().join("rsfiler/keymap.json"),
            r#"{"j": "cursorDown"}"#,
        )
        .unwrap();
        assert_eq!(
            load_keymap_from(Some(dir.path())).unwrap()["j"],
            Some("cursorDown".to_string())
        );
    }
}
