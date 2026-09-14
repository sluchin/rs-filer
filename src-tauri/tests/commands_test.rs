use rsfiler_lib::commands::{get_home_dir, read_directory};
use std::fs::{self, File};

#[test]
fn test_get_home_dir_integration() {
    let result = get_home_dir();
    assert!(result.is_ok(), "ホームディレクトリの取得に成功すること");
    let path = result.unwrap();
    assert!(!path.is_empty(), "取得したパスが空文字でないこと");
}

#[test]
fn test_read_directory_integration() {
    // 一時テスト用ディレクトリルートの作成
    let mut test_dir = std::env::temp_dir();
    test_dir.push("rsfiler_integration_test_read_directory");
    let _ = fs::remove_dir_all(&test_dir); // 既存の残りがあればクリーンアップ
    fs::create_dir_all(&test_dir).expect("テスト用ディレクトリの作成に失敗しました");

    // テスト用ファイルとサブフォルダの作成
    let file_b = test_dir.join("b_file.txt");
    let file_a = test_dir.join("a_file.txt");
    let dir_z = test_dir.join("z_dir");
    let dir_a = test_dir.join("a_dir");

    File::create(&file_b).unwrap();
    File::create(&file_a).unwrap();
    fs::create_dir(&dir_z).unwrap();
    fs::create_dir(&dir_a).unwrap();

    // 実行
    let result = read_directory(test_dir.to_str().unwrap().to_string());
    assert!(result.is_ok(), "ディレクトリの読み取りに成功すること");

    let entries = result.unwrap();
    assert_eq!(entries.len(), 4, "4つのエントリが取得できること");

    // ソート順の検証（① ディレクトリ優先 → ② アルファベット順）
    assert_eq!(entries[0].name, "a_dir");
    assert!(entries[0].is_dir);

    assert_eq!(entries[1].name, "z_dir");
    assert!(entries[1].is_dir);

    assert_eq!(entries[2].name, "a_file.txt");
    assert!(!entries[2].is_dir);

    assert_eq!(entries[3].name, "b_file.txt");
    assert!(!entries[3].is_dir);

    // 後始末
    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_read_directory_non_existent_integration() {
    let result = read_directory("/non_existent_path_rsfiler_12345".to_string());
    assert!(result.is_err(), "存在しないパスの場合は Err が返ること");
}
