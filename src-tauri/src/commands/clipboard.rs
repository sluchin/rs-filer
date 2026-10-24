//! ファイルパスのクリップボード操作.
//!
//! ファイルは, OS 標準のファイルリスト形式 (Windows は `CF_HDROP`, macOS は `NSURL`, Linux は
//! `text/uri-list`) でクリップボードへ入れるので, OS のファイルマネージャとコピー・貼り付けができます.
//! 文字の区切りを使わないので, `;` や改行を含む名前も, そのまま扱えます.

use std::fs;
use std::path::Path;

/// クリップボードの操作を行うトレイト. テストでは, 実際のクリップボードの代わりを渡す.
trait SystemClipboard {
    /// 文字列をクリップボードへ入れます.
    fn set_text(&self, text: String) -> Result<(), String>;

    /// クリップボードの文字列を読み取ります. 文字列が無い場合は空.
    fn get_text(&self) -> Result<String, String>;

    /// ファイルリストをクリップボードへ入れます.
    fn set_file_list(&self, paths: &[String]) -> Result<(), String>;

    /// クリップボードのファイルリストを読み取ります. ファイルリストが無い場合は空.
    fn get_file_list(&self) -> Result<Vec<String>, String>;
}

/// 実際の OS のクリップボード.
// OS のクリップボード (arboard) を読み書きするだけのもので, cargo test では使えないため,
// カバレッジの対象外にする (パスの扱いは copy_files_with / read_files_with で検証する).
#[cfg(not(tarpaulin_include))]
struct OsClipboard;

#[cfg(not(tarpaulin_include))]
impl OsClipboard {
    /// クリップボードを開きます.
    fn open() -> Result<arboard::Clipboard, String> {
        arboard::Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))
    }
}

#[cfg(not(tarpaulin_include))]
impl SystemClipboard for OsClipboard {
    fn set_text(&self, text: String) -> Result<(), String> {
        Self::open()?
            .set_text(text)
            .map_err(|e| format!("Failed to copy: {}", e))
    }

    fn get_text(&self) -> Result<String, String> {
        match Self::open()?.get_text() {
            Err(arboard::Error::ContentNotAvailable) => Ok(String::new()),
            result => result.map_err(|e| format!("Failed to read clipboard: {}", e)),
        }
    }

    fn set_file_list(&self, paths: &[String]) -> Result<(), String> {
        Self::open()?
            .set()
            .file_list(paths)
            .map_err(|e| format!("Failed to copy: {}", e))
    }

    fn get_file_list(&self) -> Result<Vec<String>, String> {
        match Self::open()?.get().file_list() {
            Ok(paths) => Ok(paths
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect()),
            Err(arboard::Error::ContentNotAvailable) => Ok(Vec::new()),
            Err(e) => Err(format!("Failed to read clipboard: {}", e)),
        }
    }
}

/// パスにエントリがあるかを判定します. シンボリックリンクは, リンク先が無くても `true`.
///
/// # Arguments
///
/// * `path` - 対象のパス.
///
/// # Returns
///
/// エントリがある場合は `true`.
fn entry_exists(path: &str) -> bool {
    !path.is_empty() && fs::symlink_metadata(Path::new(path)).is_ok()
}

/// 存在するパスだけを, ファイルリストとしてクリップボードへ入れます.
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
fn copy_files_with(clipboard: &dyn SystemClipboard, paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Err("No files to copy".to_string());
    }
    let existing: Vec<String> = paths.into_iter().filter(|p| entry_exists(p)).collect();
    if existing.is_empty() {
        return Err("No existing files to copy".to_string());
    }
    clipboard.set_file_list(&existing)
}

/// クリップボードの文字列から, パスを取り出します (`M-w` でコピーしたフルパスなど).
///
/// 文字列 (末尾の改行を除く) 全体が 1 つのパスとして存在すれば, それを使います. そうでなければ,
/// 1 行を 1 つのパスとして扱います.
///
/// # Arguments
///
/// * `text` - クリップボードの文字列.
///
/// # Returns
///
/// パスの候補 (存在するかは確かめていない). 空の文字列の場合は空.
fn paths_from_text(text: &str) -> Vec<String> {
    let whole = text.trim_end_matches(['\r', '\n']);
    if whole.is_empty() {
        return Vec::new();
    }
    if entry_exists(whole) {
        return vec![whole.to_string()];
    }
    whole
        .lines()
        .map(|line| line.trim_end_matches('\r').to_string())
        .collect()
}

/// クリップボードから, 存在するパスだけを取り出します.
///
/// ファイルリストがあればそれを, 無ければ文字列のパス (`paths_from_text`) を読みます.
///
/// # Arguments
///
/// * `clipboard` - 読み取るクリップボード.
///
/// # Returns
///
/// ファイルパスのリスト. クリップボードが空の場合, 存在するパスが無い場合, 読み取りに失敗した場合は,
/// エラー文字列を含む [`Err`].
fn read_files_with(clipboard: &dyn SystemClipboard) -> Result<Vec<String>, String> {
    let mut paths = clipboard.get_file_list()?;
    if paths.is_empty() {
        paths = paths_from_text(&clipboard.get_text()?);
    }
    if paths.is_empty() {
        return Err("Clipboard is empty".to_string());
    }
    let existing: Vec<String> = paths.into_iter().filter(|p| entry_exists(p)).collect();
    if existing.is_empty() {
        Err("No valid file paths in clipboard".to_string())
    } else {
        Ok(existing)
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
fn copy_text_with(clipboard: &dyn SystemClipboard, text: String) -> Result<(), String> {
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
#[path = "../../tests/unit/commands/clipboard_test.rs"]
mod tests;
