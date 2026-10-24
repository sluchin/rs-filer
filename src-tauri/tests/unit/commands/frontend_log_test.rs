//! `commands::frontend_log` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `commands::frontend_log` の子モジュール (`#[path]`) として組み込む.

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
    log_frontend_message(vec![
        FrontendLogEntry {
            level: LogLevel::Info,
            message: "test".to_string(),
        },
        FrontendLogEntry {
            level: LogLevel::Error,
            message: "failed".to_string(),
        },
    ]);
}

#[test]
fn test_escape_control_keeps_one_line() {
    assert_eq!(
        escape_control("Error: boom\n    at f (a.ts:1)\r\nfake INFO line"),
        "Error: boom\\n    at f (a.ts:1)\\r\\nfake INFO line"
    );
    // タブと, 制御文字でない文字 (日本語・バックスラッシュ) は, そのまま残す.
    assert_eq!(escape_control("a\tb 日本 C:\\x"), "a\tb 日本 C:\\x");
    // それ以外の制御文字は, \u{..} の形にする.
    assert_eq!(escape_control("a\u{1b}[31mb\u{0}"), "a\\u{1b}[31mb\\u{0}");
}
