use rsfiler::commands::{
    history_path, load_history_from, retain_existing, save_history_to, PaneHistory,
    DEFAULT_HISTORY_LIMIT,
};
use std::fs;
use std::path::Path;
use tempfile::tempdir;

/// 一時ディレクトリの下に, 名前のディレクトリを作って, そのパスを返す.
fn make_dirs(root: &Path, names: &[&str]) -> Vec<String> {
    names
        .iter()
        .map(|name| {
            let dir = root.join(name);
            fs::create_dir_all(&dir).unwrap();
            dir.to_string_lossy().into_owned()
        })
        .collect()
}

#[test]
fn test_history_path_success() {
    assert_eq!(
        history_path(Path::new("/cfg")),
        Path::new("/cfg/rsfiler/history.json")
    );
}

#[test]
fn test_default_history_limit_is_1000() {
    assert_eq!(DEFAULT_HISTORY_LIMIT, 1_000);
}

#[test]
fn test_retain_existing_removes_missing_and_files() {
    let dir = tempdir().unwrap();
    let dirs = make_dirs(dir.path(), &["a", "b"]);
    let file = dir.path().join("f.txt");
    fs::write(&file, "x").unwrap();
    let missing = dir.path().join("gone").to_string_lossy().into_owned();

    let kept = retain_existing(
        vec![
            dirs[0].clone(),
            missing,
            file.to_string_lossy().into_owned(),
            dirs[1].clone(),
        ],
        10,
    );

    assert_eq!(kept, dirs);
}

#[test]
fn test_retain_existing_keeps_the_newest_up_to_the_limit() {
    let dir = tempdir().unwrap();
    let dirs = make_dirs(dir.path(), &["a", "b", "c"]);

    assert_eq!(retain_existing(dirs.clone(), 2), dirs[1..].to_vec());
    assert_eq!(retain_existing(dirs.clone(), 3), dirs);
    // 上限が 0 でも, 今のディレクトリの分の 1 件は残す.
    assert_eq!(retain_existing(dirs.clone(), 0), dirs[2..].to_vec());
}

#[test]
fn test_save_and_load_history_round_trip() {
    let config = tempdir().unwrap();
    let work = tempdir().unwrap();
    let dirs = make_dirs(work.path(), &["a", "b", "c"]);
    let history = PaneHistory {
        left: dirs.clone(),
        right: vec![dirs[2].clone()],
    };

    save_history_to(Some(config.path()), &history).unwrap();

    assert_eq!(
        load_history_from(Some(config.path()), DEFAULT_HISTORY_LIMIT).unwrap(),
        history
    );
}

#[test]
fn test_load_history_from_removes_missing_and_applies_the_limit() {
    let config = tempdir().unwrap();
    let work = tempdir().unwrap();
    let dirs = make_dirs(work.path(), &["a", "b", "c"]);
    let history = PaneHistory {
        left: dirs.clone(),
        right: dirs.clone(),
    };
    save_history_to(Some(config.path()), &history).unwrap();
    fs::remove_dir(&dirs[1]).unwrap();

    let loaded = load_history_from(Some(config.path()), 1).unwrap();
    assert_eq!(loaded.left, vec![dirs[2].clone()]);

    let loaded = load_history_from(Some(config.path()), 10).unwrap();
    assert_eq!(loaded.right, vec![dirs[0].clone(), dirs[2].clone()]);
}

#[test]
fn test_load_history_from_without_file_is_empty() {
    let config = tempdir().unwrap();
    assert_eq!(
        load_history_from(Some(config.path()), 10).unwrap(),
        PaneHistory::default()
    );
    assert_eq!(load_history_from(None, 10).unwrap(), PaneHistory::default());
}

#[test]
fn test_load_history_from_partial_file_uses_empty_for_missing_pane() {
    let config = tempdir().unwrap();
    let work = tempdir().unwrap();
    let dirs = make_dirs(work.path(), &["a"]);
    let file = history_path(config.path());
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, serde_json_left(&dirs[0])).unwrap();

    let loaded = load_history_from(Some(config.path()), 10).unwrap();

    assert_eq!(loaded.left, dirs);
    assert!(loaded.right.is_empty());
}

/// 左ペインだけの履歴の JSON を返す (パスの `\` を JSON の書き方にする).
fn serde_json_left(path: &str) -> String {
    format!(r#"{{"left": ["{}"]}}"#, path.replace('\\', "\\\\"))
}

#[test]
fn test_load_history_from_failures() {
    let config = tempdir().unwrap();
    let file = history_path(config.path());
    fs::create_dir_all(file.parent().unwrap()).unwrap();

    fs::write(&file, "not json").unwrap();
    assert!(load_history_from(Some(config.path()), 10)
        .unwrap_err()
        .starts_with("Invalid"));

    // ファイルの代わりにディレクトリがあると, 読めない.
    fs::remove_file(&file).unwrap();
    fs::create_dir(&file).unwrap();
    assert!(load_history_from(Some(config.path()), 10)
        .unwrap_err()
        .starts_with("Failed to read"));
}

#[test]
fn test_save_history_to_failures() {
    let history = PaneHistory::default();
    assert!(save_history_to(None, &history)
        .unwrap_err()
        .contains("not available"));

    // 書き込み先にディレクトリがあると, 書けない.
    let config = tempdir().unwrap();
    fs::create_dir_all(history_path(config.path())).unwrap();
    assert!(save_history_to(Some(config.path()), &history).is_err());

    // 親のディレクトリを作れないと, 書けない.
    let blocker = tempdir().unwrap();
    let not_dir = blocker.path().join("file");
    fs::write(&not_dir, "x").unwrap();
    assert!(save_history_to(Some(&not_dir), &history).is_err());
}

#[test]
fn test_history_limit_defaults_and_survives_save_config() {
    use rsfiler::commands::config::{load_config_from, save_config_to};
    use rsfiler::commands::AppConfig;

    let config = tempdir().unwrap();
    assert_eq!(
        load_config_from(Some(config.path())).unwrap().history_limit,
        DEFAULT_HISTORY_LIMIT
    );

    // 利用者が config.json に書いた上限を読む.
    let file = config.path().join("rsfiler/config.json");
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, r#"{"history_limit": 50}"#).unwrap();
    assert_eq!(
        load_config_from(Some(config.path())).unwrap().history_limit,
        50
    );

    // フロントエンドから (上限を知らない既定値で) 保存しても, 書いた上限を残す.
    save_config_to(Some(config.path()), &AppConfig::default()).unwrap();
    assert_eq!(
        load_config_from(Some(config.path())).unwrap().history_limit,
        50
    );
}
