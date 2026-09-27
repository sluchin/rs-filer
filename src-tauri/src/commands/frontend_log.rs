//! フロントエンドから転送されたログメッセージを, バックエンドのログとして記録するコマンド.

use serde::Deserialize;

/// フロントエンドから送られる, ログの重大度.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
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

/// フロントエンドのログメッセージを, バックエンドのログ (標準エラー出力とログファイル) へ記録します.
///
/// フロントエンドの `loglevel` の出力を, ブラウザの開発者ツールでしか見られないコンソールだけでなく,
/// バックエンドのログファイルにも残すために使います. ログの記録自体は失敗しないため, 戻り値はありません.
///
/// # Arguments
///
/// * `level` - ログの重大度.
/// * `message` - ログの内容.
#[tauri::command]
pub fn log_frontend_message(level: LogLevel, message: String) {
    log::log!(target: "frontend", level.into(), "{}", message);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_level_into_success() {
        assert_eq!(log::Level::from(LogLevel::Debug), log::Level::Debug);
        assert_eq!(log::Level::from(LogLevel::Info), log::Level::Info);
        assert_eq!(log::Level::from(LogLevel::Warn), log::Level::Warn);
        assert_eq!(log::Level::from(LogLevel::Error), log::Level::Error);
    }

    #[test]
    fn test_log_frontend_message_does_not_panic() {
        log_frontend_message(LogLevel::Info, "test".to_string());
    }
}
