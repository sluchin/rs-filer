//! `commands::history` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `commands::history` の子モジュール (`#[path]`) として組み込む.

use super::*;
use tempfile::tempdir;

fn dirs_in(root: &Path, count: usize) -> Vec<String> {
    (0..count)
        .map(|i| {
            let dir = root.join(format!("d{i}"));
            fs::create_dir_all(&dir).unwrap();
            dir.to_string_lossy().into_owned()
        })
        .collect()
}

#[test]
fn test_load_history_with_limit_uses_config_limit() {
    let dir = tempdir().unwrap();
    let paths = dirs_in(dir.path(), 3);
    let history = PaneHistory {
        left: paths.clone(),
        right: Vec::new(),
    };
    save_history_to(Some(dir.path()), &history).unwrap();
    // history_limit は, save_config_to では書き換えない項目なので, ファイルへ直接書く.
    let config_file = dir.path().join("rsfiler").join("config.json");
    fs::write(&config_file, r#"{ "history_limit": 2 }"#).unwrap();

    let loaded = load_history_with_limit(Some(dir.path())).unwrap();

    assert_eq!(loaded.left, paths[1..].to_vec());
}

#[test]
fn test_load_history_with_limit_broken_config_uses_default() {
    let dir = tempdir().unwrap();
    let paths = dirs_in(dir.path(), 3);
    let history = PaneHistory {
        left: paths.clone(),
        right: Vec::new(),
    };
    save_history_to(Some(dir.path()), &history).unwrap();
    let config_file = dir.path().join("rsfiler").join("config.json");
    fs::write(&config_file, "{ broken").unwrap();

    assert_eq!(
        load_history_with_limit(Some(dir.path())).unwrap().left,
        paths
    );
}

#[test]
fn test_load_history_with_limit_broken_history_failure() {
    let dir = tempdir().unwrap();
    let file = history_path(dir.path());
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, "{ broken").unwrap();

    assert!(load_history_with_limit(Some(dir.path())).is_err());
}
