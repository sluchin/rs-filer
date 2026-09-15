use rsfiler::commands::{copy_item, get_home_dir, read_directory};
use std::fs::{self, File};
use std::io::Write;
use tempfile::tempdir;

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

#[tokio::test]
async fn test_copy_item_single_file() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let src_dir = temp_dir.path().join("src");
    let dest_dir = temp_dir.path().join("dest");

    fs::create_dir_all(&src_dir).unwrap();
    fs::create_dir_all(&dest_dir).unwrap();

    let src_file_path = src_dir.join("test.txt");
    let content = "Hello, Tauri!";
    let mut file = File::create(&src_file_path).unwrap();
    file.write_all(content.as_bytes()).unwrap();

    let result = copy_item(
        src_file_path.to_str().unwrap().to_string(),
        dest_dir.to_str().unwrap().to_string(),
    )
    .await;

    assert!(result.is_ok(), "copy_item failed: {:?}", result.err());

    let copied_file_path = dest_dir.join("test.txt");
    assert!(copied_file_path.exists());
    assert_eq!(fs::read_to_string(copied_file_path).unwrap(), content);
}

#[tokio::test]
async fn test_copy_item_directory_recursively() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let src_dir = temp_dir.path().join("src_dir");
    let sub_dir = src_dir.join("sub_dir");
    let dest_dir = temp_dir.path().join("dest_dir");

    fs::create_dir_all(&sub_dir).unwrap();
    fs::create_dir_all(&dest_dir).unwrap();

    let file1_path = src_dir.join("file1.txt");
    let file2_path = sub_dir.join("file2.txt");

    fs::write(&file1_path, "Content 1").unwrap();
    fs::write(&file2_path, "Content 2").unwrap();

    let result = copy_item(
        src_dir.to_str().unwrap().to_string(),
        dest_dir.to_str().unwrap().to_string(),
    )
    .await;

    assert!(result.is_ok(), "Directory copy failed: {:?}", result.err());

    let copied_dir = dest_dir.join("src_dir");
    assert!(copied_dir.join("file1.txt").is_file());
    assert!(copied_dir.join("sub_dir/file2.txt").is_file());
}

#[tokio::test]
async fn test_copy_item_non_existent_source() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let non_existent_src = temp_dir.path().join("does_not_exist.txt");
    let dest_dir = temp_dir.path().join("dest");

    // コピー先ディレクトリをあらかじめ作っておく
    fs::create_dir_all(&dest_dir).unwrap();

    let result = copy_item(
        non_existent_src.to_str().unwrap().to_string(),
        dest_dir.to_str().unwrap().to_string(),
    )
    .await;

    // エラーが返っていることを検証
    assert!(result.is_err(), "Expected Err but got Ok");

    // 返ってきたエラーメッセージがプロダクションコードの文字列と一致するか検証
    let err_msg = result.unwrap_err();
    assert!(
        err_msg.contains("Source path does not exist"),
        "Unexpected error message: {}",
        err_msg
    );
}
