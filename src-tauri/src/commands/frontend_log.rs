//! フロントエンドから転送されたログメッセージを, バックエンドのログとして記録するコマンド.

use crate::logging::FRONTEND_TARGET;
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
#[derive(Deserialize, Type, Debug, Clone, PartialEq)]
pub struct FrontendLogEntry {
    /// ログの重大度.
    pub level: LogLevel,
    /// ログを出した時刻 (UNIX 時間のミリ秒. JavaScript の `Date.now()`).
    pub time: f64,
    /// ログを出した機能の名前 (`loglevel` のロガーの名前. `explorer` など). 名前の無いロガーは空文字列.
    pub name: String,
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

/// ログのターゲットを返します.
///
/// 機能の名前は, ログの 1 行の中で区切りや別の行を装わないよう, 英数字と `-`, `_` だけのものを使います.
///
/// # Arguments
///
/// * `name` - ログを出した機能の名前.
///
/// # Returns
///
/// `frontend::<機能の名前>`. 名前が空か, 使えない文字を含む場合は `frontend`.
fn target_for(name: &str) -> String {
    let valid = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if valid {
        format!("{}::{}", FRONTEND_TARGET, name)
    } else {
        FRONTEND_TARGET.to_string()
    }
}

/// フロントエンドのログメッセージを, バックエンドのログ (標準エラー出力とログファイル) へ記録します.
///
/// フロントエンドの `loglevel` の出力を, ブラウザの開発者ツールでしか見られないコンソールだけでなく,
/// バックエンドのログファイルにも残すために使います. IPC の回数を減らすため, フロントエンドは
/// 複数件をまとめて送ります. 1 件は 1 行で記録します (改行などの制御文字はエスケープする).
/// 時刻は, 記録した時刻ではなく, フロントエンドでログを出した時刻 (`time`) にします.
/// ターゲットは, 機能の名前 (`name`) ごとに `frontend::<機能の名前>` にします.
/// ログの記録自体は失敗しないため, 戻り値はありません.
///
/// # Arguments
///
/// * `entries` - ログ (古い順).
#[tauri::command]
#[specta::specta]
pub fn log_frontend_message(entries: Vec<FrontendLogEntry>) {
    for entry in entries {
        // キーの名前は `logging::TIME_KEY` に合わせる (ログの書き込みで, この時刻を使う).
        log::log!(
            target: &target_for(&entry.name),
            entry.level.into(),
            time = entry.time as i64;
            "{}",
            escape_control(&entry.message)
        );
    }
}

#[cfg(test)]
#[path = "../../tests/unit/commands/frontend_log_test.rs"]
mod tests;
