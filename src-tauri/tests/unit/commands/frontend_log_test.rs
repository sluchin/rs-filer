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
    log_frontend_message(LogLevel::Info, "test".to_string());
}
