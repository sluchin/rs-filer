//! ディレクトリの移動履歴 (ペインごと) の保存と, 起動時の読み込みを行うコマンド.
//!
//! 履歴は, 件数が多くなる (既定の上限は 1000 件) ので, `config.json` とは別のファイル
//! (`<設定ディレクトリ>/rsfiler/history.json`) に保存します.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::{Path, PathBuf};

/// 履歴のファイルのファイル名.
const HISTORY_FILE: &str = "history.json";

/// 履歴の件数の上限の既定値 (`config.json` の `history_limit` で変えられる).
pub const DEFAULT_HISTORY_LIMIT: usize = 1_000;

/// 左右のペインの, ディレクトリの移動履歴 (最後に移動した日時の古い順. 同じディレクトリは 1 つだけ).
#[derive(Serialize, Deserialize, Type, Clone, PartialEq, Debug, Default)]
#[serde(default)]
pub struct PaneHistory {
    /// 左ペインの履歴.
    pub left: Vec<String>,
    /// 右ペインの履歴.
    pub right: Vec<String>,
}

/// 履歴のファイルのパスを返します.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ.
///
/// # Returns
///
/// `<設定ディレクトリ>/rsfiler/history.json`.
pub fn history_path(config_dir: &Path) -> PathBuf {
    config_dir.join("rsfiler").join(HISTORY_FILE)
}

/// 履歴から, 今は無いディレクトリを除き, 新しい方から上限の件数までを残します.
///
/// # Arguments
///
/// * `paths` - 履歴 (古い順).
/// * `limit` - 件数の上限. 0 の場合は 1 として扱う (今のディレクトリの分).
///
/// # Returns
///
/// 残した履歴 (古い順).
pub fn retain_existing(paths: Vec<String>, limit: usize) -> Vec<String> {
    let mut kept: Vec<String> = paths
        .into_iter()
        .filter(|p| Path::new(p).is_dir())
        .collect();
    let limit = limit.max(1);
    if kept.len() > limit {
        kept.drain(..kept.len() - limit);
    }
    kept
}

/// 設定ディレクトリから履歴を読み込みます. 今は無いディレクトリは除き, 上限の件数までにします.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
/// * `limit` - 件数の上限 (ペインごと).
///
/// # Returns
///
/// 履歴. 設定ディレクトリやファイルが無い場合は空. 読み込めない場合や JSON の形式が不正な場合は,
/// エラー文字列を含む [`Err`].
pub fn load_history_from(config_dir: Option<&Path>, limit: usize) -> Result<PaneHistory, String> {
    let Some(dir) = config_dir else {
        return Ok(PaneHistory::default());
    };
    let path = history_path(dir);
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(PaneHistory::default()),
        Err(e) => return Err(format!("Failed to read {}: {}", path.display(), e)),
    };
    let history: PaneHistory =
        serde_json::from_str(&text).map_err(|e| format!("Invalid {}: {}", path.display(), e))?;
    Ok(PaneHistory {
        left: retain_existing(history.left, limit),
        right: retain_existing(history.right, limit),
    })
}

/// 設定ディレクトリへ履歴を書き込みます. 親ディレクトリが無ければ作成します.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
/// * `history` - 書き込む履歴.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`]. 設定ディレクトリを取得できない場合や, 書き込みに失敗した場合は,
/// エラー文字列を含む [`Err`].
pub fn save_history_to(config_dir: Option<&Path>, history: &PaneHistory) -> Result<(), String> {
    let dir = config_dir.ok_or_else(|| "Config directory is not available".to_string())?;
    let path = history_path(dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // 件数が多いので, 整形せずに書く.
    let text = serde_json::to_string(history).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

/// ユーザーの設定から, 履歴を読み込みます. 今は無いディレクトリは除き, `config.json` の
/// `history_limit` の件数までにします.
///
/// # Returns
///
/// 履歴. 保存されていない場合は空. 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリを読むため, カバレッジの対象外にする (ロジックは load_history_from で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub async fn load_history() -> Result<PaneHistory, String> {
    let config_dir = dirs::config_dir();
    let limit = super::config::load_config_from(config_dir.as_deref())
        .map(|config| config.history_limit)
        .unwrap_or(DEFAULT_HISTORY_LIMIT);
    load_history_from(config_dir.as_deref(), limit).inspect_err(|e| {
        log::error!("移動履歴の読み込み失敗: {}", e);
    })
}

/// ユーザーの設定へ, 履歴を書き込みます.
///
/// 件数が多いと書き込みに時間がかかるので, 画面を止めないように, 非同期のコマンドにします.
///
/// # Arguments
///
/// * `history` - 書き込む履歴.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリへ書くため, カバレッジの対象外にする (ロジックは save_history_to で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub async fn save_history(history: PaneHistory) -> Result<(), String> {
    save_history_to(dirs::config_dir().as_deref(), &history).inspect_err(|e| {
        log::error!("移動履歴の書き込み失敗: {}", e);
    })
}
