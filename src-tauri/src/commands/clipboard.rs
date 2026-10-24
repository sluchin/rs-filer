//! ファイルパスのクリップボード操作.
//!
//! OS のファイルリスト形式ではなく, パスを `;` 区切りのテキストとして,クリップボードへ入れます.

use std::path::Path;

/// 文字列のクリップボード操作を行うトレイト. テストでは, 実際のクリップボードの代わりを渡す.
trait TextClipboard {
    /// 文字列をクリップボードへ入れます.
    fn set_text(&self, text: String) -> Result<(), String>;

    /// クリップボードの文字列を読み取ります.
    fn get_text(&self) -> Result<String, String>;
}

/// 実際の OS のクリップボード.
// OS のクリップボード (arboard) を読み書きするだけのもので, cargo test では使えないため,
// カバレッジの対象外にする (パスの扱いは copy_files_with / read_files_with で検証する).
#[cfg(not(tarpaulin_include))]
struct OsClipboard;

#[cfg(not(tarpaulin_include))]
impl TextClipboard for OsClipboard {
    fn set_text(&self, text: String) -> Result<(), String> {
        arboard::Clipboard::new()
            .map_err(|e| format!("Failed to access clipboard: {}", e))?
            .set_text(text)
            .map_err(|e| format!("Failed to copy: {}", e))
    }

    fn get_text(&self) -> Result<String, String> {
        arboard::Clipboard::new()
            .map_err(|e| format!("Failed to access clipboard: {}", e))?
            .get_text()
            .map_err(|e| format!("Failed to read clipboard: {}", e))
    }
}

/// 存在するパスだけを, `;` 区切りの文字列として, クリップボードへ入れます.
///
/// # Arguments
///
/// * `clipboard` - 書き込むクリップボード.
/// * `paths` - コピーするファイルパスのリスト.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. パスが無い場合, 存在するパスが無い場合, 書き込みに失敗した場合は,
/// エラー文字列を含む [`Err`].
fn copy_files_with(clipboard: &dyn TextClipboard, paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Err("No files to copy".to_string());
    }
    let existing: Vec<String> = paths
        .into_iter()
        .filter(|p| Path::new(p).exists())
        .collect();
    if existing.is_empty() {
        return Err("No existing files to copy".to_string());
    }
    clipboard.set_text(existing.join(";"))
}

/// クリップボードの `;` 区切りの文字列から, 存在するパスだけを取り出します.
///
/// # Arguments
///
/// * `clipboard` - 読み取るクリップボード.
///
/// # Returns
///
/// ファイルパスのリスト. クリップボードが空の場合, 存在するパスが無い場合, 読み取りに失敗した場合は,
/// エラー文字列を含む [`Err`].
fn read_files_with(clipboard: &dyn TextClipboard) -> Result<Vec<String>, String> {
    let text = clipboard.get_text()?;
    if text.is_empty() {
        return Err("Clipboard is empty".to_string());
    }
    let paths: Vec<String> = text
        .split(';')
        .filter(|p| !p.is_empty() && Path::new(p).exists())
        .map(str::to_string)
        .collect();
    if paths.is_empty() {
        Err("No valid file paths in clipboard".to_string())
    } else {
        Ok(paths)
    }
}

/// 文字列を, そのままクリップボードへ入れます (空の文字列は入れません).
///
/// # Arguments
///
/// * `clipboard` - 書き込むクリップボード.
/// * `text` - コピーする文字列.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 空の場合や書き込みに失敗した場合は, エラー文字列を含む [`Err`].
fn copy_text_with(clipboard: &dyn TextClipboard, text: String) -> Result<(), String> {
    check_text(&text)?;
    clipboard.set_text(text)
}

/// ファイルリストをクリップボードにコピーします.
///
/// # Arguments
///
/// * `paths` - コピーするファイルパスのリスト.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 失敗した場合はエラー文字列を含む [`Err`].
// 実際のクリップボードを書き換えるため, カバレッジの対象外にする (ロジックは copy_files_with で検証する).
#[tauri::command]
#[specta::specta]
#[cfg(not(tarpaulin_include))]
pub fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
    copy_files_with(&OsClipboard, paths)
}

/// クリップボードからファイルリストを読み取ります.
///
/// # Returns
///
/// ファイルパスのリスト. クリップボードが空またはファイルを含まない場合はエラー.
// 実際のクリップボードを読むため, カバレッジの対象外にする (ロジックは read_files_with で検証する).
#[tauri::command]
#[specta::specta]
#[cfg(not(tarpaulin_include))]
pub fn read_clipboard_files() -> Result<Vec<String>, String> {
    read_files_with(&OsClipboard)
}

/// クリップボードへ入れる文字列を確かめます (空の文字列は入れません).
///
/// # Arguments
///
/// * `text` - クリップボードへ入れる文字列.
///
/// # Returns
///
/// 入れてよい場合は [`Ok`]. 空の場合はエラー文字列を含む [`Err`].
pub fn check_text(text: &str) -> Result<(), String> {
    if text.is_empty() {
        return Err("No text to copy".to_string());
    }
    Ok(())
}

/// 文字列 (フルパスや名前) を, そのままクリップボードへコピーします.
///
/// ファイルのコピー (`copy_files_to_clipboard`) とは違い, パスの存在は確かめません.
///
/// # Arguments
///
/// * `text` - コピーする文字列.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 失敗した場合はエラー文字列を含む [`Err`].
// 実際のクリップボードを書き換えるため, カバレッジの対象外にする (ロジックは copy_text_with で検証する).
#[tauri::command]
#[specta::specta]
#[cfg(not(tarpaulin_include))]
pub fn copy_text_to_clipboard(text: String) -> Result<(), String> {
    copy_text_with(&OsClipboard, text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use tempfile::tempdir;

    /// テスト用のクリップボード. `fail` が `true` の場合は, 読み書きに失敗する.
    struct FakeClipboard {
        text: RefCell<String>,
        fail: bool,
    }

    impl FakeClipboard {
        fn new(text: &str) -> Self {
            Self {
                text: RefCell::new(text.to_string()),
                fail: false,
            }
        }

        fn failing() -> Self {
            Self {
                text: RefCell::new(String::new()),
                fail: true,
            }
        }
    }

    impl TextClipboard for FakeClipboard {
        fn set_text(&self, text: String) -> Result<(), String> {
            if self.fail {
                return Err("set failed".to_string());
            }
            *self.text.borrow_mut() = text;
            Ok(())
        }

        fn get_text(&self) -> Result<String, String> {
            if self.fail {
                return Err("get failed".to_string());
            }
            Ok(self.text.borrow().clone())
        }
    }

    fn path_string(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn test_copy_files_with_existing_only_success() {
        let dir = tempdir().unwrap();
        let a = dir.path().join("a.txt");
        let b = dir.path().join("b.txt");
        std::fs::write(&a, "1").unwrap();
        std::fs::write(&b, "2").unwrap();
        let missing = dir.path().join("missing.txt");
        let clipboard = FakeClipboard::new("");

        copy_files_with(
            &clipboard,
            vec![path_string(&a), path_string(&missing), path_string(&b)],
        )
        .unwrap();

        assert_eq!(
            *clipboard.text.borrow(),
            format!("{};{}", path_string(&a), path_string(&b))
        );
    }

    #[test]
    fn test_copy_files_with_failure() {
        let dir = tempdir().unwrap();
        let a = dir.path().join("a.txt");
        std::fs::write(&a, "1").unwrap();
        let clipboard = FakeClipboard::new("");

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
            "set failed"
        );
    }

    #[test]
    fn test_read_files_with_existing_only_success() {
        let dir = tempdir().unwrap();
        let a = dir.path().join("a.txt");
        std::fs::write(&a, "1").unwrap();
        let missing = dir.path().join("missing.txt");
        let clipboard =
            FakeClipboard::new(&format!("{};;{}", path_string(&a), path_string(&missing)));

        assert_eq!(read_files_with(&clipboard).unwrap(), vec![path_string(&a)]);
    }

    #[test]
    fn test_read_files_with_failure() {
        let dir = tempdir().unwrap();
        assert_eq!(
            read_files_with(&FakeClipboard::new("")).unwrap_err(),
            "Clipboard is empty"
        );
        assert_eq!(
            read_files_with(&FakeClipboard::new(&path_string(&dir.path().join("none"))))
                .unwrap_err(),
            "No valid file paths in clipboard"
        );
        assert_eq!(
            read_files_with(&FakeClipboard::failing()).unwrap_err(),
            "get failed"
        );
    }

    #[test]
    fn test_copy_text_with_success_and_failure() {
        let clipboard = FakeClipboard::new("");
        copy_text_with(&clipboard, "名前.txt".to_string()).unwrap();
        assert_eq!(*clipboard.text.borrow(), "名前.txt");

        assert_eq!(
            copy_text_with(&clipboard, String::new()).unwrap_err(),
            "No text to copy"
        );
        assert_eq!(
            copy_text_with(&FakeClipboard::failing(), "x".to_string()).unwrap_err(),
            "set failed"
        );
    }
}
