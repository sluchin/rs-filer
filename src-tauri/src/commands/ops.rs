//! ファイル・ディレクトリの作成・名前変更を行うコマンド.

use std::fs;
use std::path::{Path, PathBuf};

/// 作成・名前変更で指定されたファイル名を検証し, 親ディレクトリと結合したパスを返します.
///
/// # Arguments
///
/// * `parent` - 親ディレクトリのパス.
/// * `name` - 検証対象のファイル名 (パス区切り文字を含まない名前).
///
/// # Returns
///
/// 結合したパスを包んだ [`Ok`]. 名前が空, `.`, `..`, またはパス区切り文字を含む場合は [`Err`].
pub(crate) fn join_valid_name(parent: &str, name: &str) -> Result<PathBuf, String> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        return Err(format!("Invalid name: {}", name));
    }
    Ok(Path::new(parent).join(trimmed))
}

/// 指定ディレクトリの直下に新しいディレクトリを作成します.
///
/// # Arguments
///
/// * `parent` - 作成先の親ディレクトリのパス.
/// * `name` - 作成するディレクトリ名.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 名前が不正な場合や同名のエントリが存在する場合はエラー文字列を含む [`Err`].
#[tauri::command]
pub fn create_directory(parent: String, name: String) -> Result<(), String> {
    let path = join_valid_name(&parent, &name)?;
    fs::create_dir(&path).map_err(|e| {
        log::error!("ディレクトリ作成失敗: {} ({})", path.display(), e);
        e.to_string()
    })?;
    log::info!("ディレクトリ作成: {}", path.display());
    Ok(())
}

/// 指定ディレクトリの直下に新しい空ファイルを作成します.
///
/// 同名のエントリが既に存在する場合は上書きせずエラーにします.
///
/// # Arguments
///
/// * `parent` - 作成先の親ディレクトリのパス.
/// * `name` - 作成するファイル名.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 名前が不正な場合や同名のエントリが存在する場合はエラー文字列を含む [`Err`].
#[tauri::command]
pub fn create_file(parent: String, name: String) -> Result<(), String> {
    let path = join_valid_name(&parent, &name)?;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| {
            log::error!("ファイル作成失敗: {} ({})", path.display(), e);
            e.to_string()
        })?;
    log::info!("ファイル作成: {}", path.display());
    Ok(())
}

/// ファイルまたはディレクトリの名前を, 同じディレクトリ内で変更します.
///
/// 変更先に同名のエントリが既に存在する場合は上書きせずエラーにします.
///
/// # Arguments
///
/// * `path` - 名前を変更するファイルまたはディレクトリのパス.
/// * `new_name` - 新しい名前 (パス区切り文字を含まない).
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 対象が存在しない場合・名前が不正な場合・変更先が存在する場合は
/// エラー文字列を含む [`Err`].
#[tauri::command]
pub fn rename_item(path: String, new_name: String) -> Result<(), String> {
    let src = Path::new(&path);
    if fs::symlink_metadata(src).is_err() {
        let message = format!("Path does not exist: {}", path);
        log::error!("{}", message);
        return Err(message);
    }
    let parent = src
        .parent()
        .ok_or_else(|| "Invalid source path".to_string())?;
    let dest = join_valid_name(&parent.to_string_lossy(), &new_name)?;
    if fs::symlink_metadata(&dest).is_ok() {
        let message = format!("Already exists: {}", dest.display());
        log::error!("{}", message);
        return Err(message);
    }
    fs::rename(src, &dest).map_err(|e| {
        log::error!("名前変更失敗: {} -> {} ({})", path, dest.display(), e);
        e.to_string()
    })?;
    log::info!("名前変更: {} -> {}", path, dest.display());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
