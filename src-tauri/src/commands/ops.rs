//! ファイル・ディレクトリのコピー・作成・名前変更・削除を行うコマンド.

use std::fs;
use std::path::{Path, PathBuf};

/// 指定されたファイルまたはディレクトリを対象ディレクトリ配下へコピーします.
///
/// 対象がディレクトリの場合は, その内容を再帰的にコピーします.
///
/// # Arguments
///
/// * `src_path` - コピー元となるファイルまたはディレクトリのパス文字列.
/// * `dest_dir` - コピー先となるディレクトリのパス文字列.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], コピー元が存在しない場合やファイルI/Oエラーが発生した場合は
/// エラー文字列を含む [`Err`] を返します.
#[tauri::command]
pub async fn copy_item(src_path: String, dest_dir: String) -> Result<(), String> {
    let src = Path::new(&src_path);
    if !src.exists() {
        return Err(format!("Source path does not exist: {}", src_path));
    }

    let file_name = src
        .file_name()
        .ok_or_else(|| "Invalid source path".to_string())?;

    let dest = Path::new(&dest_dir).join(file_name);

    copy_recursively(src, &dest)
}

/// ディレクトリまたはファイルを再帰的にコピーする内部関数.
///
/// # Arguments
///
/// * `src` - コピー元のパス.
/// * `dst` - コピー先のパス（配置先のファイル名またはディレクトリ名を含むパス）.
///
/// # Returns
///
/// コピーが成功した場合は [`Ok(())`], コピー処理中にエラーが発生した場合は [`Err`] を返します.
fn copy_recursively(src: &Path, dst: &Path) -> Result<(), String> {
    if src.is_dir() {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let entry_path = entry.path();
            let target_path = dst.join(entry.file_name());
            if entry_path.is_dir() {
                copy_recursively(&entry_path, &target_path)?;
            } else {
                fs::copy(&entry_path, &target_path).map_err(|e| e.to_string())?;
            }
        }
    } else {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(src, dst).map_err(|e| e.to_string())?;
    }
    Ok(())
}

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
fn join_valid_name(parent: &str, name: &str) -> Result<PathBuf, String> {
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
    fs::create_dir(&path).map_err(|e| e.to_string())
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
        .map(|_| ())
        .map_err(|e| e.to_string())
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
        return Err(format!("Path does not exist: {}", path));
    }
    let parent = src
        .parent()
        .ok_or_else(|| "Invalid source path".to_string())?;
    let dest = join_valid_name(&parent.to_string_lossy(), &new_name)?;
    if fs::symlink_metadata(&dest).is_ok() {
        return Err(format!("Already exists: {}", dest.display()));
    }
    fs::rename(src, &dest).map_err(|e| e.to_string())
}

/// ファイルまたはディレクトリをゴミ箱へ移動します.
///
/// # Arguments
///
/// * `path` - 対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
#[cfg(not(tarpaulin_include))]
fn move_to_trash(path: &Path) -> Result<(), String> {
    trash::delete(path).map_err(|e| e.to_string())
}

/// 削除の実処理. 完全削除でない場合は, 渡された `trasher` でゴミ箱へ移動します.
///
/// # Arguments
///
/// * `path` - 削除対象のパス.
/// * `permanent` - `true` の場合は完全に削除し, `false` の場合は `trasher` に任せる.
/// * `trasher` - ゴミ箱へ移動する関数.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 対象が存在しない場合や削除に失敗した場合はエラー文字列を含む [`Err`].
fn delete_with(
    path: &Path,
    permanent: bool,
    trasher: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| format!("Path does not exist: {}", path.display()))?;
    if !permanent {
        return trasher(path);
    }
    if metadata.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

/// ファイルまたはディレクトリを削除します.
///
/// # Arguments
///
/// * `path` - 削除対象のパス.
/// * `permanent` - `true` の場合は完全に削除し, `false` の場合はゴミ箱へ移動する.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command]
pub fn delete_item(path: String, permanent: bool) -> Result<(), String> {
    delete_with(Path::new(&path), permanent, move_to_trash)
}

#[cfg(test)]
mod tests {
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
    fn test_delete_with_trash_success() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("f.txt");
        fs::write(&file, "x").unwrap();
        let mut called = false;
        delete_with(&file, false, |p| {
            called = true;
            assert_eq!(p, file);
            Ok(())
        })
        .unwrap();
        assert!(called);
        assert!(file.exists(), "trasher に任せるので実ファイルは残ること");
    }

    #[test]
    fn test_delete_with_trash_failure() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("f.txt");
        fs::write(&file, "x").unwrap();
        let result = delete_with(&file, false, |_| Err("trash failed".to_string()));
        assert_eq!(result, Err("trash failed".to_string()));
    }

    #[test]
    fn test_delete_with_permanent_file_success() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("f.txt");
        fs::write(&file, "x").unwrap();
        delete_with(&file, true, |_| panic!("trasher は呼ばれないこと")).unwrap();
        assert!(!file.exists());
    }

    #[test]
    fn test_delete_with_permanent_directory_success() {
        let dir = tempdir().unwrap();
        let sub = dir.path().join("sub");
        fs::create_dir_all(sub.join("inner")).unwrap();
        fs::write(sub.join("inner").join("f.txt"), "x").unwrap();
        delete_with(&sub, true, |_| panic!("trasher は呼ばれないこと")).unwrap();
        assert!(!sub.exists());
    }

    #[test]
    fn test_delete_with_missing_failure() {
        let dir = tempdir().unwrap();
        let result = delete_with(&dir.path().join("none"), true, |_| Ok(()));
        assert!(result.unwrap_err().contains("does not exist"));
    }
}
