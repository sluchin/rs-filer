//! 最近開いたファイルの一覧の保存と, 起動時の読み込みを行うコマンド.
//!
//! 一覧は, 件数が多くなる (既定の上限は 300 件) ので, `config.json` とは別のファイル
//! (`<設定ディレクトリ>/rsfiler/recent_files.json`) に保存します.

use super::config::write_atomic;
use std::fs;
use std::path::{Path, PathBuf};

/// 最近開いたファイルの一覧のファイルのファイル名.
const RECENT_FILES_FILE: &str = "recent_files.json";

/// 最近開いたファイルの件数の上限の既定値 (`config.json` の `recent_files_limit` で変えられる).
pub const DEFAULT_RECENT_FILES_LIMIT: usize = 300;

/// 最近開いたファイルの一覧のファイルのパスを返します.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ.
///
/// # Returns
///
/// `<設定ディレクトリ>/rsfiler/recent_files.json`.
pub fn recent_files_path(config_dir: &Path) -> PathBuf {
    config_dir.join("rsfiler").join(RECENT_FILES_FILE)
}

/// 一覧から, 今は無いファイルを除き, 新しい方から上限の件数までを残します.
///
/// # Arguments
///
/// * `paths` - 最近開いたファイル (古い順).
/// * `limit` - 件数の上限. 0 の場合は 1 として扱う.
///
/// # Returns
///
/// 残した一覧 (古い順).
pub fn retain_existing_files(paths: Vec<String>, limit: usize) -> Vec<String> {
    let mut kept: Vec<String> = paths
        .into_iter()
        .filter(|p| Path::new(p).is_file())
        .collect();
    let limit = limit.max(1);
    if kept.len() > limit {
        kept.drain(..kept.len() - limit);
    }
    kept
}

/// 設定ディレクトリから, 最近開いたファイルの一覧を読み込みます. 今は無いファイルは除き, 上限の件数までにします.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
/// * `limit` - 件数の上限.
///
/// # Returns
///
/// 一覧 (古い順). 設定ディレクトリやファイルが無い場合は空. 読み込めない場合や JSON の形式が不正な場合は,
/// エラー文字列を含む [`Err`].
pub fn load_recent_files_from(
    config_dir: Option<&Path>,
    limit: usize,
) -> Result<Vec<String>, String> {
    let Some(dir) = config_dir else {
        return Ok(Vec::new());
    };
    let path = recent_files_path(dir);
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("Failed to read {}: {}", path.display(), e)),
    };
    let paths: Vec<String> =
        serde_json::from_str(&text).map_err(|e| format!("Invalid {}: {}", path.display(), e))?;
    Ok(retain_existing_files(paths, limit))
}

/// 設定ディレクトリへ, 最近開いたファイルの一覧を書き込みます. 親ディレクトリが無ければ作成します.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
/// * `paths` - 書き込む一覧 (古い順).
///
/// # Returns
///
/// 成功した場合は [`Ok(())`]. 設定ディレクトリを取得できない場合や, 書き込みに失敗した場合は,
/// エラー文字列を含む [`Err`].
pub fn save_recent_files_to(config_dir: Option<&Path>, paths: &[String]) -> Result<(), String> {
    let dir = config_dir.ok_or_else(|| "Config directory is not available".to_string())?;
    let text = serde_json::to_string(paths).map_err(|e| e.to_string())?;
    write_atomic(&recent_files_path(dir), text.as_bytes())
}

/// 設定ディレクトリから, 最近開いたファイルの一覧を読み込みます. 件数の上限は, `config.json` の
/// `recent_files_limit` を使います. `config.json` を読み込めない場合は, 既定値を使います.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
///
/// # Returns
///
/// 一覧 (古い順). 失敗した場合はエラー文字列を含む [`Err`].
pub fn load_recent_files_with_limit(config_dir: Option<&Path>) -> Result<Vec<String>, String> {
    let limit = super::config::load_config_from(config_dir)
        .map(|config| config.recent_files_limit)
        .unwrap_or(DEFAULT_RECENT_FILES_LIMIT);
    load_recent_files_from(config_dir, limit)
}

/// ユーザーの設定から, 最近開いたファイルの一覧を読み込みます.
///
/// # Returns
///
/// 一覧 (古い順). 保存されていない場合は空. 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリを読むため, カバレッジの対象外にする (処理は load_recent_files_with_limit で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub async fn load_recent_files() -> Result<Vec<String>, String> {
    load_recent_files_with_limit(dirs::config_dir().as_deref()).inspect_err(|e| {
        log::error!("最近開いたファイルの読み込み失敗: {}", e);
    })
}

/// ユーザーの設定へ, 最近開いたファイルの一覧を書き込みます.
///
/// # Arguments
///
/// * `paths` - 書き込む一覧 (古い順).
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリへ書くため, カバレッジの対象外にする (ロジックは save_recent_files_to で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub async fn save_recent_files(paths: Vec<String>) -> Result<(), String> {
    save_recent_files_to(dirs::config_dir().as_deref(), &paths).inspect_err(|e| {
        log::error!("最近開いたファイルの書き込み失敗: {}", e);
    })
}
