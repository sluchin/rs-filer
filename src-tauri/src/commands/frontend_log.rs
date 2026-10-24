//! フロントエンドから転送されたログメッセージを, バックエンドのログとして記録するコマンド.

use serde::Deserialize;
use specta::Type;

/// フロントエンドから送られる, ログの重大度.
#[derive(Deserialize, Type, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    /// 詳細なデバッグ情報.
    Debug,
    /// 通常の操作の記録.
    Info,
    /// 警告.
    Warn,
    /// エラー.
    Error,
}

impl From<LogLevel> for log::Level {
    fn from(level: LogLevel) -> Self {
        match level {
            LogLevel::Debug => log::Level::Debug,
            LogLevel::Info => log::Level::Info,
            LogLevel::Warn => log::Level::Warn,
            LogLevel::Error => log::Level::Error,
        }
    }
}

/// フロントエンドから送られる, 1 件のログ.
#[derive(Deserialize, Type, Debug, Clone, PartialEq, Eq)]
pub struct FrontendLogEntry {
    /// ログの重大度.
    pub level: LogLevel,
    /// ログの内容.
    pub message: String,
}

/// ログの 1 件が 1 行に収まるよう, 改行などの制御文字を, エスケープした表記に置き換えます.
///
/// スタックトレースのような複数行のメッセージも 1 行になり, メッセージの中の改行で,
/// 別のログの行を装うこともできなくなります. タブはそのまま残します.
///
/// # Arguments
///
/// * `message` - ログの内容.
///
/// # Returns
///
/// `\n` / `\r` と, それ以外の制御文字を `\u{..}` の形にした文字列.
fn escape_control(message: &str) -> String {
    let mut escaped = String::with_capacity(message.len());
    for c in message.chars() {
        match c {
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push(c),
            c if c.is_control() => escaped.extend(c.escape_unicode()),
            c => escaped.push(c),
        }
    }
    escaped
}

/// フロントエンドのログメッセージを, バックエンドのログ (標準エラー出力とログファイル) へ記録します.
///
/// フロントエンドの `loglevel` の出力を, ブラウザの開発者ツールでしか見られないコンソールだけでなく,
/// バックエンドのログファイルにも残すために使います. IPC の回数を減らすため, フロントエンドは
/// 複数件をまとめて送ります. 1 件は 1 行で記録します (改行などの制御文字はエスケープする).
/// ログの記録自体は失敗しないため, 戻り値はありません.
///
/// # Arguments
///
/// * `entries` - ログ (古い順).
#[tauri::command]
#[specta::specta]
pub fn log_frontend_message(entries: Vec<FrontendLogEntry>) {
    for entry in entries {
        log::log!(target: "frontend", entry.level.into(), "{}", escape_control(&entry.message));
    }
}

#[cfg(test)]
#[path = "../../tests/unit/commands/frontend_log_test.rs"]
mod tests;
