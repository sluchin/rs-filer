//! 操作ログの保存と, 起動時の読み込みを行うコマンド.
//!
//! 操作ログは, 30 日間 (`RETENTION_MS`) 残します. 起動前のログも見られるように,
//! `config.json` とは別のファイル (`<設定ディレクトリ>/rsfiler/operation_log.json`) に保存します.

use super::config::write_atomic;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::{Path, PathBuf};

/// 操作ログのファイルのファイル名.
const OPERATION_LOG_FILE: &str = "operation_log.json";

/// 操作ログを残す期間 (ミリ秒. 30 日).
pub const RETENTION_MS: i64 = 30 * 24 * 60 * 60 * 1000;

/// 操作ログの 1 件.
#[derive(Serialize, Deserialize, Type, Clone, PartialEq, Debug)]
pub struct LogRecord {
    /// 記録した時刻 (UNIX 時刻のミリ秒).
    pub time: i64,
    /// 種類. エラーは `error`, それ以外は `info`.
    pub level: String,
    /// メッセージ.
    pub message: String,
}

/// 操作ログのファイルのパスを返します.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ.
///
/// # Returns
///
/// `<設定ディレクトリ>/rsfiler/operation_log.json`.
pub fn operation_log_path(config_dir: &Path) -> PathBuf {
    config_dir.join("rsfiler").join(OPERATION_LOG_FILE)
}

/// 操作ログから, 残す期間より古いものを除きます.
///
/// # Arguments
///
/// * `entries` - 操作ログ.
/// * `now_ms` - 今の時刻 (UNIX 時刻のミリ秒).
///
/// # Returns
///
/// 残す期間の中のログ (順番はそのまま).
pub fn retain_recent(entries: Vec<LogRecord>, now_ms: i64) -> Vec<LogRecord> {
    let oldest = now_ms.saturating_sub(RETENTION_MS);
    entries.into_iter().filter(|e| e.time >= oldest).collect()
}

/// 今の時刻を, UNIX 時刻のミリ秒で返します.
///
/// # Returns
///
/// UNIX 時刻のミリ秒. 時計が 1970 年より前の場合は 0.
pub fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|d| i64::try_from(d.as_millis()).ok())
        .unwrap_or(0)
}

/// 設定ディレクトリから操作ログを読み込みます. 残す期間より古いものは除きます.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
/// * `now_ms` - 今の時刻 (UNIX 時刻のミリ秒).
///
/// # Returns
///
/// 操作ログ. 設定ディレクトリやファイルが無い場合は空. 読み込めない場合や JSON の形式が不正な場合は,
/// エラー文字列を含む [`Err`].
pub fn load_operation_log_from(
    config_dir: Option<&Path>,
    now_ms: i64,
) -> Result<Vec<LogRecord>, String> {
    let Some(dir) = config_dir else {
        return Ok(Vec::new());
    };
    let path = operation_log_path(dir);
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("Failed to read {}: {}", path.display(), e)),
    };
    let entries: Vec<LogRecord> =
        serde_json::from_str(&text).map_err(|e| format!("Invalid {}: {}", path.display(), e))?;
    Ok(retain_recent(entries, now_ms))
}

/// 設定ディレクトリへ操作ログを書き込みます. 残す期間より古いものは書きません.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
/// * `entries` - 書き込む操作ログ.
/// * `now_ms` - 今の時刻 (UNIX 時刻のミリ秒).
///
/// # Returns
///
/// 成功した場合は [`Ok(())`]. 設定ディレクトリを取得できない場合や, 書き込みに失敗した場合は,
/// エラー文字列を含む [`Err`].
pub fn save_operation_log_to(
    config_dir: Option<&Path>,
    entries: Vec<LogRecord>,
    now_ms: i64,
) -> Result<(), String> {
    let dir = config_dir.ok_or_else(|| "Config directory is not available".to_string())?;
    let kept = retain_recent(entries, now_ms);
    // 件数が多いので, 整形せずに書く. 途中で落ちても壊れないように, 一時ファイルから置き換える.
    let text = serde_json::to_string(&kept).map_err(|e| e.to_string())?;
    write_atomic(&operation_log_path(dir), text.as_bytes())
}

/// ユーザーの設定から, 操作ログを読み込みます. 30 日より古いものは除きます.
///
/// # Returns
///
/// 操作ログ (古い順). 保存されていない場合は空. 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリを読むため, カバレッジの対象外にする (処理は load_operation_log_from で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub async fn load_operation_log() -> Result<Vec<LogRecord>, String> {
    load_operation_log_from(dirs::config_dir().as_deref(), now_millis()).inspect_err(|e| {
        log::error!("操作ログの読み込み失敗: {}", e);
    })
}

/// ユーザーの設定へ, 操作ログを書き込みます.
///
/// # Arguments
///
/// * `entries` - 書き込む操作ログ (古い順).
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリへ書くため, カバレッジの対象外にする (ロジックは save_operation_log_to で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub async fn save_operation_log(entries: Vec<LogRecord>) -> Result<(), String> {
    save_operation_log_to(dirs::config_dir().as_deref(), entries, now_millis()).inspect_err(|e| {
        log::error!("操作ログの書き込み失敗: {}", e);
    })
}
