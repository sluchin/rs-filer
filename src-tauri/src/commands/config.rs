//! 設定ファイル (キーマップ・アプリ設定) の読み込み・書き込みを行うコマンド.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// キーマップ設定ファイルのファイル名.
const KEYMAP_FILE: &str = "keymap.json";
/// アプリ設定ファイルのファイル名.
const CONFIG_FILE: &str = "config.json";

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

/// テーマ (配色).
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// xyzzy クラシック風の配色 (既定).
    Classic,
    /// 暗い配色.
    Dark,
}

/// フォントサイズ.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum FontSize {
    /// 小.
    Small,
    /// 中 (既定).
    Medium,
    /// 大.
    Large,
}

/// アプリケーションの設定.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(default)]
pub struct AppConfig {
    /// テーマ.
    pub theme: Theme,
    /// フォントサイズ.
    pub font_size: FontSize,
    /// エディタのコマンド. 指定が無い場合は環境変数 `VISUAL` / `EDITOR` を使う.
    pub editor: Option<String>,
    /// ターミナルのコマンド. 指定が無い場合は OS ごとの既定のターミナルを順に試す.
    pub terminal: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            theme: Theme::Classic,
            font_size: FontSize::Medium,
            editor: None,
            terminal: None,
        }
    }
}

/// アプリ設定ファイルのパスを返します.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ.
///
/// # Returns
///
/// `<設定ディレクトリ>/rsfiler/config.json`.
fn config_path(config_dir: &Path) -> PathBuf {
    config_dir.join("rsfiler").join(CONFIG_FILE)
}

/// アプリ設定ファイルを読み込みます. 個々の項目が無い場合は, その項目だけ既定値を使います.
///
/// # Arguments
///
/// * `path` - 設定ファイルのパス.
///
/// # Returns
///
/// 設定. ファイルが無い場合は既定値. 読み込めない場合や JSON の形式が不正な場合は,
/// エラー文字列を含む [`Err`].
fn read_config(path: &Path) -> Result<AppConfig, String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(AppConfig::default()),
        Err(e) => return Err(format!("Failed to read {}: {}", path.display(), e)),
    };
    serde_json::from_str(&text).map_err(|e| format!("Invalid {}: {}", path.display(), e))
}

/// アプリ設定ファイルを書き込みます. 親ディレクトリが無ければ作成します.
///
/// # Arguments
///
/// * `path` - 設定ファイルのパス.
/// * `config` - 書き込む設定.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
fn write_config(path: &Path, config: &AppConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

/// 設定ディレクトリからアプリ設定を読み込みます.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
///
/// # Returns
///
/// 設定. 設定ディレクトリやファイルが無い場合は既定値. 失敗した場合はエラー文字列を含む [`Err`].
pub(crate) fn load_config_from(config_dir: Option<&Path>) -> Result<AppConfig, String> {
    match config_dir {
        Some(dir) => read_config(&config_path(dir)),
        None => Ok(AppConfig::default()),
    }
}

/// 設定ディレクトリへアプリ設定を書き込みます.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ.
/// * `config` - 書き込む設定.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 設定ディレクトリを取得できない場合や書き込みに失敗した場合は
/// エラー文字列を含む [`Err`].
fn save_config_to(config_dir: Option<&Path>, config: &AppConfig) -> Result<(), String> {
    let dir = config_dir.ok_or_else(|| "Config directory is not available".to_string())?;
    write_config(&config_path(dir), config)
}

/// ユーザーのアプリ設定を読み込みます.
///
/// # Returns
///
/// 設定. 設定ファイルが無い場合は既定値. 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリを読むため, カバレッジの対象外にする (ロジックは load_config_from で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
pub fn load_config() -> Result<AppConfig, String> {
    load_config_from(dirs::config_dir().as_deref())
}

/// ユーザーのアプリ設定を書き込みます.
///
/// # Arguments
///
/// * `config` - 書き込む設定.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリへ書くため, カバレッジの対象外にする (ロジックは save_config_to で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    save_config_to(dirs::config_dir().as_deref(), &config)
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
    fn test_config_path_success() {
        assert_eq!(
            config_path(Path::new("/cfg")),
            Path::new("/cfg/rsfiler/config.json")
        );
    }

    #[test]
    fn test_read_config_missing_file_is_default() {
        let dir = tempdir().unwrap();
        assert_eq!(
            read_config(&dir.path().join("none.json")).unwrap(),
            AppConfig::default()
        );
    }

    #[test]
    fn test_read_write_config_round_trip() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("sub/config.json");
        let config = AppConfig {
            theme: Theme::Dark,
            font_size: FontSize::Large,
            editor: Some("code".to_string()),
            terminal: Some("konsole".to_string()),
        };

        write_config(&path, &config).unwrap();

        assert_eq!(read_config(&path).unwrap(), config);
    }

    #[test]
    fn test_read_config_partial_uses_defaults_for_missing_fields() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"theme": "dark"}"#).unwrap();

        let config = read_config(&path).unwrap();

        assert_eq!(config.theme, Theme::Dark);
        assert_eq!(config.font_size, FontSize::Medium);
        assert_eq!(config.editor, None);
    }

    #[test]
    fn test_read_config_invalid_failure() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, "not json").unwrap();
        assert!(read_config(&path).unwrap_err().starts_with("Invalid"));
    }

    #[test]
    fn test_read_config_unreadable_failure() {
        let dir = tempdir().unwrap();
        assert!(read_config(dir.path())
            .unwrap_err()
            .starts_with("Failed to read"));
    }

    #[test]
    fn test_load_save_config_from_success() {
        let dir = tempdir().unwrap();
        assert_eq!(load_config_from(None).unwrap(), AppConfig::default());
        assert_eq!(
            load_config_from(Some(dir.path())).unwrap(),
            AppConfig::default()
        );

        let config = AppConfig {
            theme: Theme::Dark,
            ..AppConfig::default()
        };
        save_config_to(Some(dir.path()), &config).unwrap();
        assert_eq!(load_config_from(Some(dir.path())).unwrap(), config);

        assert!(save_config_to(None, &config)
            .unwrap_err()
            .contains("not available"));
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
