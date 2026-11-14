//! 操作ログ (`commands::oplog`) の結合テスト.

use rsfiler::commands::{
    load_operation_log_from, now_millis, operation_log_path, retain_recent, save_operation_log_to,
    LogRecord, RETENTION_MS,
};
use std::fs;
use std::path::Path;
use tempfile::tempdir;

fn record(time: i64, message: &str) -> LogRecord {
    LogRecord {
        time,
        level: "info".to_string(),
        message: message.to_string(),
    }
}

#[test]
fn test_operation_log_path_success() {
    assert_eq!(
        operation_log_path(Path::new("/cfg")),
        Path::new("/cfg/rsfiler/operation_log.json")
    );
}

#[test]
fn test_retain_recent_drops_entries_older_than_30_days() {
    let now = 100 * RETENTION_MS;
    let kept = retain_recent(
        vec![
            record(now - RETENTION_MS - 1, "old"),
            record(now - RETENTION_MS, "edge"),
            record(now, "new"),
        ],
        now,
    );
    let messages: Vec<&str> = kept.iter().map(|e| e.message.as_str()).collect();
    assert_eq!(messages, ["edge", "new"]);
}

#[test]
fn test_now_millis_is_after_2020() {
    assert!(now_millis() > 1_577_836_800_000);
}

#[test]
fn test_save_and_load_operation_log_roundtrip_drops_old_entries() {
    let dir = tempdir().unwrap();
    let now = 100 * RETENTION_MS;
    save_operation_log_to(
        Some(dir.path()),
        vec![
            record(now - RETENTION_MS - 5, "old"),
            record(now - 10, "recent"),
        ],
        now,
    )
    .unwrap();
    assert_eq!(
        load_operation_log_from(Some(dir.path()), now).unwrap(),
        vec![record(now - 10, "recent")]
    );
    // 読み込むときにも古いものは除く.
    assert!(
        load_operation_log_from(Some(dir.path()), now + RETENTION_MS + 100)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn test_load_operation_log_without_directory_or_file_is_empty() {
    assert!(load_operation_log_from(None, 0).unwrap().is_empty());
    let dir = tempdir().unwrap();
    assert!(load_operation_log_from(Some(dir.path()), 0)
        .unwrap()
        .is_empty());
}

#[test]
fn test_load_operation_log_reports_invalid_json_and_unreadable_path() {
    let dir = tempdir().unwrap();
    let path = operation_log_path(dir.path());
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, "not json").unwrap();
    let err = load_operation_log_from(Some(dir.path()), 0).unwrap_err();
    assert!(err.starts_with("Invalid "), "{err}");

    // ファイルの場所がディレクトリだと, 読み込みに失敗する.
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    let err = load_operation_log_from(Some(dir.path()), 0).unwrap_err();
    assert!(err.starts_with("Failed to read "), "{err}");
}

#[test]
fn test_save_operation_log_without_directory_fails() {
    let err = save_operation_log_to(None, vec![], 0).unwrap_err();
    assert!(err.contains("not available"));
}
