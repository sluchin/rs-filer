//! ファイルパスのクリップボード操作.

use std::path::Path;

/// ファイルリストのクリップボード操作を行うトレイト.
trait FileClipboard {
    /// ファイルリストをクリップボードにコピーします.
    fn set_files(&self, paths: Vec<String>) -> Result<(), String>;

    /// クリップボードからファイルリストを読み取ります.
    fn get_files(&self) -> Result<Vec<String>, String>;
}

/// 実クリップボード操作 (OS ネイティブ).
#[cfg(not(tarpaulin_include))]
struct OsClipboard;

#[cfg(not(tarpaulin_include))]
impl FileClipboard for OsClipboard {
    fn set_files(&self, paths: Vec<String>) -> Result<(), String> {
        if paths.is_empty() {
            return Err("No files to copy".to_string());
        }

        // 存在するパスのみをフィルタリング.
        let existing: Vec<String> = paths
            .iter()
            .filter(|p| Path::new(p).exists())
            .cloned()
            .collect();

        if existing.is_empty() {
            return Err("No existing files to copy".to_string());
        }

        let mut clipboard =
            arboard::Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;

        // テキストとして path を ; 区切りで格納.
        let text = existing.join(";");
        clipboard
            .set_text(text)
            .map_err(|e| format!("Failed to copy files: {}", e))?;

        Ok(())
    }

    fn get_files(&self) -> Result<Vec<String>, String> {
        let mut clipboard =
            arboard::Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;

        let text = clipboard
            .get_text()
            .map_err(|e| format!("Failed to read clipboard: {}", e))?;

        if text.is_empty() {
            return Err("Clipboard is empty".to_string());
        }

        // ; 区切りで分割して、存在するパスのみを返す.
        let paths: Vec<String> = text
            .split(';')
            .filter(|p| !p.is_empty() && Path::new(p).exists())
            .map(|s| s.to_string())
            .collect();

        if paths.is_empty() {
            Err("No valid file paths in clipboard".to_string())
        } else {
            Ok(paths)
        }
    }
}

/// テスト用フェイク実装.
#[cfg(test)]
struct FakeClipboard {
    files: std::cell::RefCell<Vec<String>>,
}

#[cfg(test)]
impl FakeClipboard {
    fn new() -> Self {
        Self {
            files: std::cell::RefCell::new(Vec::new()),
        }
    }
}

#[cfg(test)]
impl FileClipboard for FakeClipboard {
    fn set_files(&self, paths: Vec<String>) -> Result<(), String> {
        if paths.is_empty() {
            return Err("No files to copy".to_string());
        }

        let existing: Vec<String> = paths
            .iter()
            .filter(|p| Path::new(p).exists())
            .cloned()
            .collect();

        if existing.is_empty() {
            return Err("No existing files to copy".to_string());
        }

        *self.files.borrow_mut() = existing;
        Ok(())
    }

    fn get_files(&self) -> Result<Vec<String>, String> {
        let files = self.files.borrow().clone();
        if files.is_empty() {
            Err("Clipboard is empty".to_string())
        } else {
            Ok(files)
        }
    }
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
#[tauri::command]
#[cfg(not(tarpaulin_include))]
pub fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
    OsClipboard.set_files(paths)
}

/// クリップボードからファイルリストを読み取ります.
///
/// # Returns
///
/// ファイルパスのリスト. クリップボードが空またはファイルを含まない場合はエラー.
#[tauri::command]
#[cfg(not(tarpaulin_include))]
pub fn read_clipboard_files() -> Result<Vec<String>, String> {
    OsClipboard.get_files()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_clipboard_copy_and_get_files() {
        let dir = tempdir().unwrap();
        let file1 = dir.path().join("a.txt");
        let file2 = dir.path().join("b.txt");
        std::fs::write(&file1, "1").unwrap();
        std::fs::write(&file2, "2").unwrap();

        let clipboard = FakeClipboard::new();
        let paths = vec![
            file1.to_string_lossy().into_owned(),
            file2.to_string_lossy().into_owned(),
        ];

        assert!(clipboard.set_files(paths).is_ok());
        let retrieved = clipboard.get_files().unwrap();
        assert_eq!(retrieved.len(), 2);
    }

    #[test]
    fn test_clipboard_copy_empty_fails() {
        let clipboard = FakeClipboard::new();
        assert_eq!(clipboard.set_files(vec![]).unwrap_err(), "No files to copy");
    }

    #[test]
    fn test_clipboard_copy_nonexistent_filtered() {
        let dir = tempdir().unwrap();
        let existing = dir.path().join("a.txt");
        let nonexistent = dir.path().join("missing.txt");
        std::fs::write(&existing, "x").unwrap();

        let clipboard = FakeClipboard::new();
        let paths = vec![
            existing.to_string_lossy().into_owned(),
            nonexistent.to_string_lossy().into_owned(),
        ];

        assert!(clipboard.set_files(paths).is_ok());
        let retrieved = clipboard.get_files().unwrap();
        assert_eq!(retrieved.len(), 1);
        assert_eq!(retrieved[0], existing.to_string_lossy().as_ref());
    }

    #[test]
    fn test_clipboard_get_empty_fails() {
        let clipboard = FakeClipboard::new();
        assert_eq!(clipboard.get_files().unwrap_err(), "Clipboard is empty");
    }
}
