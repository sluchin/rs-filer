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
    // ロガーの無いテストでは, 既定のレベル (Off) だと `log!` の引数 (時刻・メッセージ) が評価されないため, 上げておく.
    log::set_max_level(log::LevelFilter::Trace);
    log_frontend_message(vec![
        FrontendLogEntry {
            level: LogLevel::Info,
            time: 1_761_351_931_123.0,
            name: "explorer".to_string(),
            message: "test".to_string(),
        },
        FrontendLogEntry {
            level: LogLevel::Error,
            time: 1_761_351_931_124.0,
            name: String::new(),
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

#[test]
fn test_target_for_uses_name() {
    assert_eq!(target_for("explorer"), "frontend::explorer");
    assert_eq!(target_for("key-bindings_2"), "frontend::key-bindings_2");
}

#[test]
fn test_target_for_without_valid_name() {
    assert_eq!(target_for(""), "frontend");
    // 区切りや別の行を装える文字を含む名前は使わない.
    assert_eq!(target_for("a b"), "frontend");
    assert_eq!(target_for("a::b"), "frontend");
    assert_eq!(target_for("a\nb"), "frontend");
}
