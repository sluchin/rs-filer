use rsfiler::commands::{
    check_conflicts, create_directory, create_file, get_home_dir, list_drives, open_in_editor,
    open_item, read_directory, rename_item, transfer, TransferKind, TransferRequest,
    TransferSummary,
};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::AtomicBool;
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

/// 進捗を無視して, 実際の操作でコピー・移動・削除を実行する.
fn run(request: TransferRequest) -> Result<TransferSummary, String> {
    transfer(&request, &AtomicBool::new(false), &mut |_| {})
}

/// テスト用の依頼を作る.
fn request(kind: TransferKind, source: &Path, dest: Option<&Path>) -> TransferRequest {
    TransferRequest {
        kind,
        sources: vec![source.to_string_lossy().into_owned()],
        dest_dir: dest.map(|p| p.to_string_lossy().into_owned()),
        overwrite: false,
        permanent: true,
    }
}

#[test]
fn test_transfer_copy_single_file_integration() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let src_dir = temp_dir.path().join("src");
    let dest_dir = temp_dir.path().join("dest");
    fs::create_dir_all(&src_dir).unwrap();
    fs::create_dir_all(&dest_dir).unwrap();

    let src_file_path = src_dir.join("test.txt");
    let content = "Hello, Tauri!";
    let mut file = File::create(&src_file_path).unwrap();
    file.write_all(content.as_bytes()).unwrap();

    let result = run(request(TransferKind::Copy, &src_file_path, Some(&dest_dir)));

    assert!(result.is_ok(), "copy failed: {:?}", result.err());
    let copied_file_path = dest_dir.join("test.txt");
    assert_eq!(fs::read_to_string(copied_file_path).unwrap(), content);
    assert!(src_file_path.exists(), "コピー元は残ること");
}

#[test]
fn test_transfer_copy_directory_recursively_integration() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let src_dir = temp_dir.path().join("src_dir");
    let sub_dir = src_dir.join("sub_dir");
    let dest_dir = temp_dir.path().join("dest_dir");
    fs::create_dir_all(&sub_dir).unwrap();
    fs::create_dir_all(&dest_dir).unwrap();
    fs::write(src_dir.join("file1.txt"), "Content 1").unwrap();
    fs::write(sub_dir.join("file2.txt"), "Content 2").unwrap();

    let result = run(request(TransferKind::Copy, &src_dir, Some(&dest_dir)));

    assert!(result.is_ok(), "Directory copy failed: {:?}", result.err());
    let copied_dir = dest_dir.join("src_dir");
    assert!(copied_dir.join("file1.txt").is_file());
    assert!(copied_dir.join("sub_dir/file2.txt").is_file());
}

#[test]
fn test_transfer_copy_non_existent_source_integration() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let missing = temp_dir.path().join("does_not_exist.txt");
    let dest_dir = temp_dir.path().join("dest");
    fs::create_dir_all(&dest_dir).unwrap();

    let err_msg = run(request(TransferKind::Copy, &missing, Some(&dest_dir))).unwrap_err();

    assert!(
        err_msg.contains("Path does not exist"),
        "Unexpected error message: {}",
        err_msg
    );
}

#[test]
fn test_transfer_move_integration() {
    let temp_dir = tempdir().unwrap();
    let src = temp_dir.path().join("a.txt");
    let dest_dir = temp_dir.path().join("dest");
    fs::create_dir_all(&dest_dir).unwrap();
    fs::write(&src, "x").unwrap();

    run(request(TransferKind::Move, &src, Some(&dest_dir))).unwrap();

    assert!(!src.exists());
    assert!(dest_dir.join("a.txt").exists());
}

#[test]
fn test_create_directory_success() {
    let dir = tempdir().unwrap();
    let parent = dir.path().to_string_lossy().into_owned();
    create_directory(parent, "newdir".to_string()).unwrap();
    assert!(dir.path().join("newdir").is_dir());
}

#[test]
fn test_create_directory_existing_failure() {
    let dir = tempdir().unwrap();
    let parent = dir.path().to_string_lossy().into_owned();
    create_directory(parent.clone(), "d".to_string()).unwrap();
    assert!(create_directory(parent, "d".to_string()).is_err());
}

#[test]
fn test_create_directory_invalid_name_failure() {
    let dir = tempdir().unwrap();
    let parent = dir.path().to_string_lossy().into_owned();
    assert!(create_directory(parent, "a/b".to_string()).is_err());
}

#[test]
fn test_create_file_success() {
    let dir = tempdir().unwrap();
    let parent = dir.path().to_string_lossy().into_owned();
    create_file(parent, "new.txt".to_string()).unwrap();
    assert_eq!(fs::read(dir.path().join("new.txt")).unwrap().len(), 0);
}

#[test]
fn test_create_file_existing_failure() {
    let dir = tempdir().unwrap();
    let existing = dir.path().join("keep.txt");
    fs::write(&existing, "data").unwrap();
    let parent = dir.path().to_string_lossy().into_owned();
    assert!(create_file(parent, "keep.txt".to_string()).is_err());
    assert_eq!(
        fs::read_to_string(&existing).unwrap(),
        "data",
        "既存の内容が保たれること"
    );
}

#[test]
fn test_rename_item_success() {
    let dir = tempdir().unwrap();
    let old = dir.path().join("old.txt");
    fs::write(&old, "x").unwrap();
    rename_item(old.to_string_lossy().into_owned(), "new.txt".to_string()).unwrap();
    assert!(!old.exists());
    assert!(dir.path().join("new.txt").exists());
}

#[test]
fn test_rename_item_missing_failure() {
    let dir = tempdir().unwrap();
    let missing = dir.path().join("none");
    assert!(rename_item(missing.to_string_lossy().into_owned(), "x".to_string()).is_err());
}

#[test]
fn test_rename_item_root_failure() {
    // 親ディレクトリを持たないパス
    let root = if cfg!(windows) { "C:/" } else { "/" };
    assert!(rename_item(root.to_string(), "x".to_string()).is_err());
}

#[test]
fn test_rename_item_invalid_name_failure() {
    let dir = tempdir().unwrap();
    let old = dir.path().join("old.txt");
    fs::write(&old, "x").unwrap();
    assert!(rename_item(old.to_string_lossy().into_owned(), "..".to_string()).is_err());
    assert!(old.exists());
}

#[test]
fn test_rename_item_existing_target_failure() {
    let dir = tempdir().unwrap();
    let a = dir.path().join("a.txt");
    let b = dir.path().join("b.txt");
    fs::write(&a, "a").unwrap();
    fs::write(&b, "b").unwrap();
    assert!(rename_item(a.to_string_lossy().into_owned(), "b.txt".to_string()).is_err());
    assert_eq!(fs::read_to_string(&b).unwrap(), "b", "上書きされないこと");
}

#[test]
fn test_transfer_delete_permanent_integration() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("f.txt");
    fs::write(&file, "x").unwrap();
    run(request(TransferKind::Delete, &file, None)).unwrap();
    assert!(!file.exists());
}

#[test]
fn test_transfer_delete_missing_integration() {
    let dir = tempdir().unwrap();
    let missing = dir.path().join("none");
    assert!(run(request(TransferKind::Delete, &missing, None)).is_err());
}

#[test]
fn test_check_conflicts_integration() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("a.txt"), "").unwrap();
    let dest = dir.path().to_string_lossy().into_owned();
    let conflicts = check_conflicts(vec!["/other/a.txt".into(), "/other/b.txt".into()], dest);
    assert_eq!(conflicts.unwrap(), vec!["a.txt".to_string()]);
}

#[test]
fn test_open_item_missing_failure() {
    let dir = tempdir().unwrap();
    let missing = dir.path().join("none");
    assert!(open_item(missing.to_string_lossy().into_owned()).is_err());
}

#[test]
fn test_open_in_editor_missing_failure() {
    let dir = tempdir().unwrap();
    let missing = dir.path().join("none");
    assert!(open_in_editor(missing.to_string_lossy().into_owned()).is_err());
}

#[test]
fn test_list_drives_success() {
    let drives = list_drives();
    assert!(!drives.is_empty(), "少なくとも 1 つのルートが返ること");
}
