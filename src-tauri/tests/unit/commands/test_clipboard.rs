//! `commands::clipboard` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `commands::clipboard` の子モジュール (`#[path]`) として組み込む.

use super::*;
use std::cell::RefCell;
use tempfile::tempdir;

/// テスト用のクリップボード. `fail` が `true` の場合は, 読み書きに失敗する.
#[derive(Default)]
struct FakeClipboard {
    text: RefCell<String>,
    files: RefCell<Vec<String>>,
    fail: bool,
}

impl FakeClipboard {
    fn with_text(text: &str) -> Self {
        Self {
            text: RefCell::new(text.to_string()),
            ..Self::default()
        }
    }

    fn with_files(files: &[String]) -> Self {
        Self {
            files: RefCell::new(files.to_vec()),
            ..Self::default()
        }
    }

    fn failing() -> Self {
        Self {
            fail: true,
            ..Self::default()
        }
    }

    fn check(&self) -> Result<(), String> {
        if self.fail {
            Err("clipboard error".to_string())
        } else {
            Ok(())
        }
    }
}

impl SystemClipboard for FakeClipboard {
    fn set_text(&self, text: String) -> Result<(), String> {
        self.check()?;
        *self.text.borrow_mut() = text;
        Ok(())
    }

    fn get_text(&self) -> Result<String, String> {
        self.check()?;
        Ok(self.text.borrow().clone())
    }

    fn set_file_list(&self, paths: &[String]) -> Result<(), String> {
        self.check()?;
        *self.files.borrow_mut() = paths.to_vec();
        Ok(())
    }

    fn get_file_list(&self) -> Result<Vec<String>, String> {
        self.check()?;
        Ok(self.files.borrow().clone())
    }
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[test]
fn test_copy_files_with_existing_only_success() {
    let dir = tempdir().unwrap();
    // `;` や空白を含む名前も, 分割されずに, そのまま入る.
    let a = dir.path().join("a;b.txt");
    let b = dir.path().join("with space.txt");
    fs::write(&a, "1").unwrap();
    fs::write(&b, "2").unwrap();
    let missing = dir.path().join("missing.txt");
    let clipboard = FakeClipboard::default();

    copy_files_with(
        &clipboard,
        vec![path_string(&a), path_string(&missing), path_string(&b)],
    )
    .unwrap();

    assert_eq!(
        *clipboard.files.borrow(),
        vec![path_string(&a), path_string(&b)]
    );
    assert_eq!(
        read_files_with(&clipboard).unwrap(),
        vec![path_string(&a), path_string(&b)]
    );
}

#[cfg(unix)]
#[test]
fn test_copy_files_with_dangling_symlink_success() {
    // リンク先の無いシンボリックリンクも, コピー・貼り付けの対象にする.
    let dir = tempdir().unwrap();
    let link = dir.path().join("broken");
    std::os::unix::fs::symlink(dir.path().join("missing"), &link).unwrap();
    let clipboard = FakeClipboard::default();

    copy_files_with(&clipboard, vec![path_string(&link)]).unwrap();

    assert_eq!(
        read_files_with(&clipboard).unwrap(),
        vec![path_string(&link)]
    );
}

#[test]
fn test_copy_files_with_failure() {
    let dir = tempdir().unwrap();
    let a = dir.path().join("a.txt");
    fs::write(&a, "1").unwrap();
    let clipboard = FakeClipboard::default();

    assert_eq!(
        copy_files_with(&clipboard, vec![]).unwrap_err(),
        "No files to copy"
    );
    assert_eq!(
        copy_files_with(&clipboard, vec![path_string(&dir.path().join("none"))]).unwrap_err(),
        "No existing files to copy"
    );
    assert_eq!(
        copy_files_with(&FakeClipboard::failing(), vec![path_string(&a)]).unwrap_err(),
        "clipboard error"
    );
}

// Windows では, 名前に改行を使えないため, Unix だけで検証する.
#[cfg(unix)]
#[test]
fn test_paths_from_text_success() {
    let dir = tempdir().unwrap();
    // 改行を含む名前でも, 全体が存在するパスなら, 1 つのパスとして扱う.
    let multi = dir.path().join("a\nb.txt");
    fs::write(&multi, "1").unwrap();
    assert_eq!(
        paths_from_text(&format!("{}\n", path_string(&multi))),
        vec![path_string(&multi)]
    );
    // そうでなければ, 1 行を 1 つのパスとして扱う.
    assert_eq!(paths_from_text("/x/a\r\n/x/b\n"), vec!["/x/a", "/x/b"]);
    assert!(paths_from_text("\n").is_empty());
}

#[test]
fn test_read_files_with_text_fallback_success() {
    let dir = tempdir().unwrap();
    let a = dir.path().join("a.txt");
    fs::write(&a, "1").unwrap();
    let missing = dir.path().join("missing.txt");
    // ファイルリストが無ければ, 文字のパスを読み, 存在するものだけを返す.
    let clipboard =
        FakeClipboard::with_text(&format!("{}\n{}", path_string(&a), path_string(&missing)));

    assert_eq!(read_files_with(&clipboard).unwrap(), vec![path_string(&a)]);
}

#[test]
fn test_read_files_with_failure() {
    let dir = tempdir().unwrap();
    assert_eq!(
        read_files_with(&FakeClipboard::default()).unwrap_err(),
        "Clipboard is empty"
    );
    assert_eq!(
        read_files_with(&FakeClipboard::with_files(&[path_string(
            &dir.path().join("none")
        )]))
        .unwrap_err(),
        "No valid file paths in clipboard"
    );
    assert_eq!(
        read_files_with(&FakeClipboard::failing()).unwrap_err(),
        "clipboard error"
    );
}

#[test]
fn test_copy_text_with_success_and_failure() {
    let clipboard = FakeClipboard::default();
    copy_text_with(&clipboard, "名前.txt".to_string()).unwrap();
    assert_eq!(*clipboard.text.borrow(), "名前.txt");

    assert_eq!(
        copy_text_with(&clipboard, String::new()).unwrap_err(),
        "No text to copy"
    );
    assert_eq!(
        copy_text_with(&FakeClipboard::failing(), "x".to_string()).unwrap_err(),
        "clipboard error"
    );
}
