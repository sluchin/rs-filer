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
#[tauri::command(async)]
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
#[tauri::command(async)]
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
///
/// # Arguments
///
/// * `path` - 対象のパス.
///
/// # Returns
///
/// C の文字列. パスに NUL を含む場合は [`std::io::ErrorKind::InvalidInput`] の [`Err`].
#[cfg(unix)]
fn c_path(path: &Path) -> std::io::Result<std::ffi::CString> {
    use std::os::unix::ffi::OsStrExt;
    std::ffi::CString::new(path.as_os_str().as_bytes())
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))
}

/// 上書きをせずに名前を変更します (Linux の `renameat2` の `RENAME_NOREPLACE`).
///
/// # Arguments
///
/// * `src` - 変更元のパス.
/// * `dest` - 変更先のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 変更先が既にある場合は [`std::io::ErrorKind::AlreadyExists`] の [`Err`].
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
///
/// # Arguments
///
/// * `src` - 変更元のパス.
/// * `dest` - 変更先のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 変更先が既にある場合は [`std::io::ErrorKind::AlreadyExists`] の [`Err`].
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
///
/// # Arguments
///
/// * `_src` - 変更元のパス (使わない).
/// * `_dest` - 変更先のパス (使わない).
///
/// # Returns
///
/// 常に [`std::io::ErrorKind::Unsupported`] の [`Err`].
#[cfg(all(unix, not(any(target_os = "linux", target_os = "macos"))))]
fn atomic_rename(_src: &Path, _dest: &Path) -> std::io::Result<()> {
    Err(std::io::ErrorKind::Unsupported.into())
}

/// 上書きをせずに名前を変更します (Windows の `MoveFileExW`. `MOVEFILE_REPLACE_EXISTING` を付けない).
///
/// # Arguments
///
/// * `src` - 変更元のパス.
/// * `dest` - 変更先のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok`]. 変更先が既にある場合は [`std::io::ErrorKind::AlreadyExists`] の [`Err`].
#[cfg(windows)]
fn atomic_rename(src: &Path, dest: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        /// ファイルやディレクトリの名前を変更します (kernel32).
        ///
        /// # Arguments
        ///
        /// * `existing` - 変更元のパス (NUL で終わる UTF-16).
        /// * `new` - 変更先のパス (NUL で終わる UTF-16).
        /// * `flags` - `MOVEFILE_*` の組み合わせ.
        ///
        /// # Returns
        ///
        /// 成功した場合は 0 以外. 失敗した場合は 0 (詳しくは `GetLastError`).
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
#[tauri::command(async)]
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
#[path = "../../tests/unit/commands/ops_test.rs"]
mod tests;
