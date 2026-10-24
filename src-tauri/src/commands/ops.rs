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
#[specta::specta]
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
#[specta::specta]
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

/// 上書きをせずに, ファイルまたはディレクトリの名前を変更します.
///
/// OS の機能 (Linux の `renameat2` の `RENAME_NOREPLACE`, macOS の `renameatx_np` の `RENAME_EXCL`,
/// Windows の `MoveFileExW`) で, 変更先の確認と名前の変更を一度に行い, その間に作られたものを
/// 上書きしないようにします (TOCTOU の競合を防ぐ). ファイルシステムが対応していない場合 (一部のネットワーク
/// ファイルシステムなど) は, 変更先が無いことを確かめてから名前を変更します.
///
/// # Arguments
///
/// * `src` - 変更元のパス.
/// * `dest` - 変更先のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`]. 変更先が既にある場合は [`std::io::ErrorKind::AlreadyExists`] の [`Err`].
pub(crate) fn rename_noreplace(src: &Path, dest: &Path) -> std::io::Result<()> {
    rename_noreplace_with(src, dest, &atomic_rename)
}

/// 上書きをしない名前の変更 `atomic` を試し, ファイルシステムが対応していなければ, 変更先が無いことを
/// 確かめてから名前を変更します.
///
/// # Arguments
///
/// * `src` - 変更元のパス.
/// * `dest` - 変更先のパス.
/// * `atomic` - 上書きをしない名前の変更.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`].
fn rename_noreplace_with(
    src: &Path,
    dest: &Path,
    atomic: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
) -> std::io::Result<()> {
    match atomic(src, dest) {
        Err(e) if is_unsupported_error(&e) => {
            let message = format!("{} ({})", dest.display(), e);
            log::warn!("上書きをしない名前の変更に未対応. 確かめてから変更します: {message}");
            if fs::symlink_metadata(dest).is_ok() {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::AlreadyExists,
                    format!("Already exists: {}", dest.display()),
                ));
            }
            fs::rename(src, dest)
        }
        result => result,
    }
}

/// ファイルシステムが, 上書きをしない名前の変更に対応していないことを表すエラーかどうかを返します.
///
/// # Arguments
///
/// * `e` - エラー.
///
/// # Returns
///
/// 対応していない場合は `true`.
fn is_unsupported_error(e: &std::io::Error) -> bool {
    e.kind() == std::io::ErrorKind::Unsupported
        || e.raw_os_error()
            .is_some_and(|code| UNSUPPORTED_ERRORS.contains(&code))
}

/// ファイルシステムが, 上書きをしない名前の変更に対応していないときのエラー番号.
#[cfg(unix)]
const UNSUPPORTED_ERRORS: &[i32] = &[libc::EINVAL, libc::ENOSYS, libc::ENOTSUP, libc::EOPNOTSUPP];

/// ファイルシステムが, 上書きをしない名前の変更に対応していないときのエラー番号 (Windows には無い).
#[cfg(windows)]
const UNSUPPORTED_ERRORS: &[i32] = &[];

/// パスを, C の文字列にします.
#[cfg(unix)]
fn c_path(path: &Path) -> std::io::Result<std::ffi::CString> {
    use std::os::unix::ffi::OsStrExt;
    std::ffi::CString::new(path.as_os_str().as_bytes())
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))
}

/// 上書きをせずに名前を変更します (Linux の `renameat2` の `RENAME_NOREPLACE`).
#[cfg(target_os = "linux")]
fn atomic_rename(src: &Path, dest: &Path) -> std::io::Result<()> {
    let (src, dest) = (c_path(src)?, c_path(dest)?);
    // SAFETY: どちらも, NUL で終わる有効な C の文字列を指す.
    let ret = unsafe {
        libc::renameat2(
            libc::AT_FDCWD,
            src.as_ptr(),
            libc::AT_FDCWD,
            dest.as_ptr(),
            libc::RENAME_NOREPLACE,
        )
    };
    if ret == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

/// 上書きをせずに名前を変更します (macOS の `renameatx_np` の `RENAME_EXCL`).
#[cfg(target_os = "macos")]
fn atomic_rename(src: &Path, dest: &Path) -> std::io::Result<()> {
    let (src, dest) = (c_path(src)?, c_path(dest)?);
    // SAFETY: どちらも, NUL で終わる有効な C の文字列を指す.
    let ret = unsafe {
        libc::renameatx_np(
            libc::AT_FDCWD,
            src.as_ptr(),
            libc::AT_FDCWD,
            dest.as_ptr(),
            libc::RENAME_EXCL,
        )
    };
    if ret == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

/// 上書きをしない名前の変更が無い OS では, 対応していないことを返します (確かめてから変更する).
#[cfg(all(unix, not(any(target_os = "linux", target_os = "macos"))))]
fn atomic_rename(_src: &Path, _dest: &Path) -> std::io::Result<()> {
    Err(std::io::ErrorKind::Unsupported.into())
}

/// 上書きをせずに名前を変更します (Windows の `MoveFileExW`. `MOVEFILE_REPLACE_EXISTING` を付けない).
#[cfg(windows)]
fn atomic_rename(src: &Path, dest: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
    }

    let wide = |p: &Path| -> Vec<u16> { p.as_os_str().encode_wide().chain([0]).collect() };
    let (src, dest) = (wide(src), wide(dest));
    // SAFETY: どちらも, NUL で終わる有効な UTF-16 の文字列を指す.
    if unsafe { MoveFileExW(src.as_ptr(), dest.as_ptr(), 0) } != 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

/// ファイルまたはディレクトリの名前を, 同じディレクトリ内で変更します.
///
/// 変更先に同名のエントリが既に存在する場合は上書きせずエラーにします.
/// アトミックな名前変更により, TOCTOU 競合による上書きを構造的に防止します.
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
#[specta::specta]
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
    rename_noreplace(src, &dest).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            let message = format!("Already exists: {}", dest.display());
            log::error!("{}", message);
            message
        } else {
            log::error!("名前変更失敗: {} -> {} ({})", path, dest.display(), e);
            e.to_string()
        }
    })?;
    log::info!("名前変更: {} -> {}", path, dest.display());
    Ok(())
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
}
