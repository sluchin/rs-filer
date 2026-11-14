//! 最近開いたファイルの一覧 (`commands::recent`) の結合テスト.

use rsfiler::commands::config::{load_config_from, save_config_to};
use rsfiler::commands::{
    load_recent_files_from, load_recent_files_with_limit, recent_files_path, retain_existing_files,
    save_recent_files_to, AppConfig, DEFAULT_RECENT_FILES_LIMIT,
};
use std::fs;
use std::path::Path;
use tempfile::tempdir;

/// 指定した名前の空のファイルを作り, そのパスを文字列で返す.
fn make_file(dir: &Path, name: &str) -> String {
    let path = dir.join(name);
    fs::write(&path, "x").unwrap();
    path.to_string_lossy().into_owned()
}

#[test]
fn test_default_recent_files_limit_is_300() {
    assert_eq!(DEFAULT_RECENT_FILES_LIMIT, 300);
    assert_eq!(AppConfig::default().recent_files_limit, 300);
}

#[test]
fn test_recent_files_path_success() {
    assert_eq!(
        recent_files_path(Path::new("/cfg")),
        Path::new("/cfg/rsfiler/recent_files.json")
    );
}

#[test]
fn test_retain_existing_files_drops_missing_and_directories_and_caps() {
    let dir = tempdir().unwrap();
    let a = make_file(dir.path(), "a");
    let b = make_file(dir.path(), "b");
    let c = make_file(dir.path(), "c");
    let missing = dir.path().join("none").to_string_lossy().into_owned();
    let sub = dir.path().to_string_lossy().into_owned();

    let kept = retain_existing_files(vec![a.clone(), missing, b.clone(), sub, c.clone()], 2);

    assert_eq!(kept, vec![b, c]);
    // 0 は 1 として扱う.
    assert_eq!(retain_existing_files(vec![a.clone()], 0), vec![a]);
}

#[test]
fn test_save_and_load_recent_files_roundtrip() {
    let config = tempdir().unwrap();
    let files = tempdir().unwrap();
    let a = make_file(files.path(), "a");
    let b = make_file(files.path(), "b");

    save_recent_files_to(Some(config.path()), &[a.clone(), b.clone()]).unwrap();

    assert_eq!(
        load_recent_files_from(Some(config.path()), 10).unwrap(),
        vec![a, b]
    );
}

#[test]
fn test_load_recent_files_without_directory_or_file_is_empty() {
    assert!(load_recent_files_from(None, 10).unwrap().is_empty());
    let config = tempdir().unwrap();
    assert!(load_recent_files_from(Some(config.path()), 10)
        .unwrap()
        .is_empty());
}

#[test]
fn test_load_recent_files_invalid_json_and_unreadable_file_fail() {
    let config = tempdir().unwrap();
    let file = recent_files_path(config.path());
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, "not json").unwrap();
    assert!(load_recent_files_from(Some(config.path()), 10)
        .unwrap_err()
        .contains("Invalid"));

    // ファイルの場所がディレクトリなら, 読み込めない.
    let config2 = tempdir().unwrap();
    fs::create_dir_all(recent_files_path(config2.path())).unwrap();
    assert!(load_recent_files_from(Some(config2.path()), 10)
        .unwrap_err()
        .contains("Failed to read"));
}

#[test]
fn test_save_recent_files_without_directory_or_to_a_file_fails() {
    assert!(save_recent_files_to(None, &[]).is_err());
    let config = tempdir().unwrap();
    let not_dir = config.path().join("file");
    fs::write(&not_dir, "x").unwrap();
    assert!(save_recent_files_to(Some(&not_dir), &[]).is_err());
}

#[test]
fn test_recent_files_limit_defaults_survives_save_config_and_caps_the_load() {
    let config = tempdir().unwrap();
    let files = tempdir().unwrap();
    let a = make_file(files.path(), "a");
    let b = make_file(files.path(), "b");
    save_recent_files_to(Some(config.path()), &[a, b.clone()]).unwrap();
    assert_eq!(
        load_config_from(Some(config.path()))
            .unwrap()
            .recent_files_limit,
        DEFAULT_RECENT_FILES_LIMIT
    );

    // 利用者が config.json に書いた上限を読み, 一覧にも使う.
    let file = config.path().join("rsfiler/config.json");
    fs::write(&file, r#"{"recent_files_limit": 1}"#).unwrap();
    assert_eq!(
        load_config_from(Some(config.path()))
            .unwrap()
            .recent_files_limit,
        1
    );
    assert_eq!(
        load_recent_files_with_limit(Some(config.path())).unwrap(),
        vec![b]
    );

    // フロントエンドから (上限を知らない既定値で) 保存しても書いた上限を残す.
    save_config_to(Some(config.path()), &AppConfig::default()).unwrap();
    assert_eq!(
        load_config_from(Some(config.path()))
            .unwrap()
            .recent_files_limit,
        1
    );
}

#[test]
fn test_load_recent_files_with_unreadable_config_uses_the_default_limit() {
    let config = tempdir().unwrap();
    let files = tempdir().unwrap();
    let a = make_file(files.path(), "a");
    save_recent_files_to(Some(config.path()), std::slice::from_ref(&a)).unwrap();
    fs::write(config.path().join("rsfiler/config.json"), "broken").unwrap();

    assert_eq!(
        load_recent_files_with_limit(Some(config.path())).unwrap(),
        vec![a]
    );
}
