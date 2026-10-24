//! `commands::config` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `commands::config` の子モジュール (`#[path]`) として組み込む.

use super::*;
use tempfile::tempdir;

#[test]
fn test_keymap_path_success() {
    assert_eq!(
        keymap_path(Path::new("/cfg")),
        Path::new("/cfg/rsfiler/keymap.json")
    );
}

#[test]
fn test_read_keymap_success() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("keymap.json");
    fs::write(&file, r#"{"C-x C-f": "touch", "q": null}"#).unwrap();

    let keymap = read_keymap(&file).unwrap();

    assert_eq!(keymap["C-x C-f"], Some("touch".to_string()));
    assert_eq!(keymap["q"], None);
}

#[test]
fn test_read_keymap_missing_file_is_empty() {
    let dir = tempdir().unwrap();
    assert!(read_keymap(&dir.path().join("none.json"))
        .unwrap()
        .is_empty());
}

#[test]
fn test_read_keymap_invalid_failure() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("keymap.json");
    fs::write(&file, "not json").unwrap();
    assert!(read_keymap(&file).unwrap_err().starts_with("Invalid"));
    fs::write(&file, r#"{"a": 1}"#).unwrap();
    assert!(read_keymap(&file).is_err());
}

#[test]
fn test_read_keymap_unreadable_failure() {
    let dir = tempdir().unwrap();
    assert!(read_keymap(dir.path())
        .unwrap_err()
        .starts_with("Failed to read"));
}

#[test]
fn test_config_path_success() {
    assert_eq!(
        config_path(Path::new("/cfg")),
        Path::new("/cfg/rsfiler/config.json")
    );
}

#[test]
fn test_read_config_missing_file_is_default() {
    let dir = tempdir().unwrap();
    assert_eq!(
        read_config(&dir.path().join("none.json")).unwrap(),
        AppConfig::default()
    );
}

#[test]
fn test_read_write_config_round_trip() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("sub/config.json");
    let config = AppConfig {
        theme: Theme::Dark,
        font_size: FontSize::Large,
        editor: Some("code".to_string()),
        terminal: Some("konsole".to_string()),
        pane_column_widths: PaneColumnWidths::default(),
        window: Some(sample_window(false)),
        last_paths: None,
        history_limit: 500,
    };

    write_config(&path, &config).unwrap();

    assert_eq!(read_config(&path).unwrap(), config);
}

#[test]
fn test_read_config_partial_uses_defaults_for_missing_fields() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("config.json");
    fs::write(&path, r#"{"theme": "dark"}"#).unwrap();

    let config = read_config(&path).unwrap();

    assert_eq!(config.theme, Theme::Dark);
    assert_eq!(config.font_size, FontSize::Medium);
    assert_eq!(config.editor, None);
}

#[test]
fn test_read_config_invalid_failure() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("config.json");
    fs::write(&path, "not json").unwrap();
    assert!(read_config(&path).unwrap_err().starts_with("Invalid"));
}

#[test]
fn test_read_config_unreadable_failure() {
    let dir = tempdir().unwrap();
    assert!(read_config(dir.path())
        .unwrap_err()
        .starts_with("Failed to read"));
}

#[test]
fn test_load_save_config_from_success() {
    let dir = tempdir().unwrap();
    assert_eq!(load_config_from(None).unwrap(), AppConfig::default());
    assert_eq!(
        load_config_from(Some(dir.path())).unwrap(),
        AppConfig::default()
    );

    let config = AppConfig {
        theme: Theme::Dark,
        ..AppConfig::default()
    };
    save_config_to(Some(dir.path()), &config).unwrap();
    assert_eq!(load_config_from(Some(dir.path())).unwrap(), config);

    assert!(save_config_to(None, &config)
        .unwrap_err()
        .contains("not available"));
}

#[test]
fn test_load_keymap_from_success() {
    let dir = tempdir().unwrap();
    assert!(load_keymap_from(None).unwrap().is_empty());
    assert!(load_keymap_from(Some(dir.path())).unwrap().is_empty());

    fs::create_dir(dir.path().join("rsfiler")).unwrap();
    fs::write(
        dir.path().join("rsfiler/keymap.json"),
        r#"{"j": "cursorDown"}"#,
    )
    .unwrap();
    assert_eq!(
        load_keymap_from(Some(dir.path())).unwrap()["j"],
        Some("cursorDown".to_string())
    );
}

fn sample_window(maximized: bool) -> WindowState {
    WindowState {
        width: 1000,
        height: 700,
        x: Some(120),
        y: Some(80),
        maximized,
    }
}

#[test]
fn test_read_config_without_window_is_none() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("config.json");
    fs::write(&file, r#"{"theme": "dark"}"#).unwrap();

    let config = read_config(&file).unwrap();

    assert_eq!(config.window, None);
    assert_eq!(config.theme, Theme::Dark);
}

#[test]
fn test_window_state_round_trip_and_optional_fields() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("config.json");
    let config = AppConfig {
        window: Some(sample_window(true)),
        ..AppConfig::default()
    };
    write_config(&file, &config).unwrap();

    assert_eq!(
        read_config(&file).unwrap().window,
        Some(sample_window(true))
    );

    // 位置と最大化が無い保存値も読める (位置は None, 最大化は false).
    fs::write(&file, r#"{"window": {"width": 900, "height": 600}}"#).unwrap();
    let window = read_config(&file).unwrap().window.unwrap();
    assert_eq!((window.width, window.height), (900, 600));
    assert_eq!((window.x, window.y, window.maximized), (None, None, false));

    // 保存していない (None) ときは, ファイルに window を書かない.
    write_config(&file, &AppConfig::default()).unwrap();
    assert!(!fs::read_to_string(&file).unwrap().contains("window"));
}

#[test]
fn test_save_config_to_keeps_the_saved_window() {
    let dir = tempdir().unwrap();
    save_window_state_to(Some(dir.path()), &sample_window(false)).unwrap();

    // フロントエンドが読み込んだ古い値 (window なし / 別の値) で保存しても, 保存済みの window を残す.
    let mut stale = AppConfig {
        theme: Theme::Dark,
        ..AppConfig::default()
    };
    save_config_to(Some(dir.path()), &stale).unwrap();
    stale.window = Some(WindowState {
        width: 500,
        height: 400,
        x: None,
        y: None,
        maximized: false,
    });
    save_config_to(Some(dir.path()), &stale).unwrap();

    let saved = load_config_from(Some(dir.path())).unwrap();
    assert_eq!(saved.theme, Theme::Dark);
    assert_eq!(saved.window, Some(sample_window(false)));
}

#[test]
fn test_save_config_to_without_saved_window_drops_the_given_one() {
    let dir = tempdir().unwrap();
    let config = AppConfig {
        window: Some(sample_window(false)),
        ..AppConfig::default()
    };

    save_config_to(Some(dir.path()), &config).unwrap();

    assert_eq!(load_config_from(Some(dir.path())).unwrap().window, None);
}

#[test]
fn test_save_window_state_to_keeps_other_settings() {
    let dir = tempdir().unwrap();
    let config = AppConfig {
        theme: Theme::Dark,
        editor: Some("vim".to_string()),
        ..AppConfig::default()
    };
    save_config_to(Some(dir.path()), &config).unwrap();

    save_window_state_to(Some(dir.path()), &sample_window(true)).unwrap();

    let saved = load_config_from(Some(dir.path())).unwrap();
    assert_eq!(saved.theme, Theme::Dark);
    assert_eq!(saved.editor, Some("vim".to_string()));
    assert_eq!(saved.window, Some(sample_window(true)));
}

#[test]
fn test_save_last_paths_to_keeps_other_settings_and_survives_save_config() {
    let dir = tempdir().unwrap();
    let config = AppConfig {
        editor: Some("vim".to_string()),
        ..AppConfig::default()
    };
    save_config_to(Some(dir.path()), &config).unwrap();
    let paths = LastPaths {
        left: "/a".to_string(),
        right: "/b".to_string(),
    };

    save_last_paths_to(Some(dir.path()), &paths).unwrap();
    save_config_to(Some(dir.path()), &config).unwrap();

    let loaded = load_config_from(Some(dir.path())).unwrap();
    assert_eq!(loaded.last_paths, Some(paths));
    assert_eq!(loaded.editor.as_deref(), Some("vim"));
}

#[test]
fn test_save_last_paths_to_failures() {
    let paths = LastPaths::default();
    assert!(save_last_paths_to(None, &paths).is_err());
    let dir = tempdir().unwrap();
    let file = config_path(dir.path());
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, "not json").unwrap();
    assert!(save_last_paths_to(Some(dir.path()), &paths).is_err());
}

#[test]
fn test_save_window_state_to_failures() {
    let state = sample_window(false);
    assert!(save_window_state_to(None, &state).is_err());

    // 壊れた設定ファイルは, 上書きしない.
    let dir = tempdir().unwrap();
    let file = config_path(dir.path());
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, "{ broken").unwrap();
    assert!(save_window_state_to(Some(dir.path()), &state).is_err());
    assert_eq!(fs::read_to_string(&file).unwrap(), "{ broken");
}

#[test]
fn test_store_window_state_to_and_load_window_state_from_success() {
    let dir = tempdir().unwrap();
    assert_eq!(load_window_state_from(Some(dir.path())), None);

    store_window_state_to(Some(dir.path()), &sample_window(true));

    assert_eq!(
        load_window_state_from(Some(dir.path())),
        Some(sample_window(true))
    );
}

#[test]
fn test_store_window_state_to_and_load_window_state_from_failure() {
    // 書き込めない場合は, ログに出すだけで, パニックしない.
    store_window_state_to(None, &sample_window(false));

    // 壊れた設定ファイルは, 状態が無いものとして扱う.
    let dir = tempdir().unwrap();
    let file = config_path(dir.path());
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, "{ broken").unwrap();
    assert_eq!(load_window_state_from(Some(dir.path())), None);
}

#[test]
fn test_write_atomic_replaces_file_and_leaves_no_temp_file() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("sub").join("config.json");

    write_atomic(&path, b"old").unwrap();
    write_atomic(&path, b"new").unwrap();

    assert_eq!(fs::read_to_string(&path).unwrap(), "new");
    assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
}

#[test]
fn test_write_atomic_failure_keeps_target_and_removes_temp_file() {
    let dir = tempdir().unwrap();
    // 中身のあるディレクトリは, ファイルの名前を変えて置き換えられない.
    let path = dir.path().join("busy");
    fs::create_dir(&path).unwrap();
    fs::write(path.join("child"), "").unwrap();

    assert!(write_atomic(&path, b"x").is_err());

    assert!(path.join("child").exists());
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn test_lock_config_recovers_from_poisoned_lock() {
    // 取得中にパニックしたスレッドがあっても, 次の取得は待たずに成功する.
    let _ = std::thread::spawn(|| {
        let _guard = lock_config();
        panic!("poison");
    })
    .join();

    drop(lock_config());
}
