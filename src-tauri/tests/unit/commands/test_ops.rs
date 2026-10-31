//! `commands::ops` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `commands::ops` の子モジュール (`#[path]`) として組み込む.

use super::*;
use tempfile::tempdir;

#[test]
fn test_join_valid_name_success() {
    let path = join_valid_name("/tmp", " a.txt ").unwrap();
    assert_eq!(path, Path::new("/tmp").join("a.txt"));
}

#[test]
fn test_join_valid_name_failure() {
    for name in ["", "  ", ".", "..", "a/b", "a\\b"] {
        assert!(join_valid_name("/tmp", name).is_err(), "name: {:?}", name);
    }
}

#[test]
fn test_rename_noreplace_atomic_prevents_overwrite() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("src.txt");
    let dest = dir.path().join("dest.txt");
    fs::write(&src, "source content").unwrap();
    fs::write(&dest, "destination content").unwrap();

    // 宛先が存在するときに rename_noreplace を呼び出すとエラーになり, 宛先が上書きされない
    let result = rename_noreplace(&src, &dest);
    assert!(result.is_err());
    assert_eq!(
        result.unwrap_err().kind(),
        std::io::ErrorKind::AlreadyExists
    );

    // 宛先の内容が保持されていることを確認
    assert_eq!(fs::read_to_string(&dest).unwrap(), "destination content");
    assert_eq!(fs::read_to_string(&src).unwrap(), "source content");
}

#[test]
fn test_rename_noreplace_with_unsupported_falls_back() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("src.txt");
    let dest = dir.path().join("dest.txt");
    fs::write(&src, "content").unwrap();
    let unsupported = |_: &Path, _: &Path| -> std::io::Result<()> {
        Err(std::io::Error::from_raw_os_error(libc::EINVAL))
    };

    // 対応していなければ, 確かめてから名前を変える
    rename_noreplace_with(&src, &dest, &unsupported).unwrap();
    assert_eq!(fs::read_to_string(&dest).unwrap(), "content");

    // 変更先があれば, 上書きしない
    fs::write(&src, "other").unwrap();
    let err = rename_noreplace_with(&src, &dest, &unsupported).unwrap_err();
    assert_eq!(err.kind(), std::io::ErrorKind::AlreadyExists);
    assert_eq!(fs::read_to_string(&dest).unwrap(), "content");
    assert!(rename_noreplace_with(&src, &dest, &|_, _| Err(
        std::io::ErrorKind::Unsupported.into()
    ))
    .is_err());
}

#[test]
fn test_rename_noreplace_with_other_error_failure() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("src.txt");
    let dest = dir.path().join("dest.txt");
    fs::write(&src, "content").unwrap();

    // 対応していない以外のエラーは, そのまま返し, 名前を変えない
    let err = rename_noreplace_with(&src, &dest, &|_, _| {
        Err(std::io::ErrorKind::PermissionDenied.into())
    })
    .unwrap_err();
    assert_eq!(err.kind(), std::io::ErrorKind::PermissionDenied);
    assert!(src.exists() && !dest.exists());
}

#[test]
fn test_rename_noreplace_invalid_path_failure() {
    let dir = tempdir().unwrap();
    let err = rename_noreplace(&dir.path().join("a\0b"), &dir.path().join("c")).unwrap_err();
    assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput);
    let err = rename_noreplace(&dir.path().join("c"), &dir.path().join("a\0b")).unwrap_err();
    assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput);
}

#[test]
fn test_rename_noreplace_success() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("src.txt");
    let dest = dir.path().join("dest.txt");
    fs::write(&src, "new content").unwrap();

    assert!(rename_noreplace(&src, &dest).is_ok());
    assert!(!src.exists());
    assert_eq!(fs::read_to_string(&dest).unwrap(), "new content");
}

#[cfg(unix)]
#[test]
fn test_rename_item_rename_failure() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("a.txt");
    fs::write(&src, "x").unwrap();
    // 書き込めないディレクトリの中では, 名前を変えられない.
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o555)).unwrap();
    let writable = fs::write(dir.path().join("probe"), "").is_ok();

    let result = rename_item(src.to_string_lossy().into_owned(), "b.txt".to_string());
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o755)).unwrap();

    // root で動いていて書き込めてしまう場合は, 確かめられない.
    if !writable {
        assert!(result.is_err());
        assert!(src.exists());
    }
}
