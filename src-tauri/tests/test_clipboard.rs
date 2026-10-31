//! クリップボード (`commands::clipboard`) の結合テスト.

use rsfiler::commands::check_text;

#[test]
fn test_check_text_accepts_text() {
    assert!(check_text("/home/user/a.txt").is_ok());
    assert!(check_text("a.txt").is_ok());
}

#[test]
fn test_check_text_rejects_empty() {
    assert_eq!(check_text("").unwrap_err(), "No text to copy");
}
