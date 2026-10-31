//! ログ (`logging`) のテスト.

use rsfiler::logging::default_level;

#[test]
fn test_default_level_by_build() {
    assert_eq!(default_level(true), log::LevelFilter::Debug);
    assert_eq!(default_level(false), log::LevelFilter::Info);
}
