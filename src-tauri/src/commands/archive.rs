//! アーカイブ (zip, tar, tar.gz) を展開するコマンド.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use flate2::read::GzDecoder;
use tar::EntryType;
use zip::ZipArchive;

use crate::commands::ops::join_valid_name;

/// 展開できるアーカイブの形式.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ArchiveFormat {
    /// zip (`.zip`).
    Zip,
    /// tar (`.tar`).
    Tar,
    /// gzip で圧縮した tar (`.tar.gz`, `.tgz`).
    TarGz,
}

/// ファイルの名前 (拡張子. 大文字と小文字は区別しない) から, アーカイブの形式を決めます.
///
/// # Arguments
///
/// * `path` - アーカイブのパス.
///
/// # Returns
///
/// 形式. 展開できない形式なら [`None`].
pub(crate) fn archive_format(path: &Path) -> Option<ArchiveFormat> {
    let name = path.file_name()?.to_string_lossy().to_lowercase();
    if name.ends_with(".zip") {
        Some(ArchiveFormat::Zip)
    } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        Some(ArchiveFormat::TarGz)
    } else if name.ends_with(".tar") {
        Some(ArchiveFormat::Tar)
    } else {
        None
    }
}

/// アーカイブの項目の名前 (バイト列) を, 文字列にします.
///
/// UTF-8 として読めなければ, Shift_JIS (日本語の Windows で作ったアーカイブの名前) として読みます.
/// どちらでも読めなければ, 読めない文字を置き換えた UTF-8 にします.
///
/// # Arguments
///
/// * `raw` - アーカイブに記録された名前.
///
/// # Returns
///
/// 名前.
pub(crate) fn entry_name(raw: &[u8]) -> String {
    if let Ok(name) = std::str::from_utf8(raw) {
        return name.to_string();
    }
    let (name, _, had_errors) = encoding_rs::SHIFT_JIS.decode(raw);
    if had_errors {
        String::from_utf8_lossy(raw).into_owned()
    } else {
        name.into_owned()
    }
}

/// アーカイブの項目の名前を, 展開先からの相対パスにします.
///
/// 区切りは `/` と `\` のどちらも使えます. 先頭の `/` と, 空の部分, `.` は除きます.
/// 展開先の外を指さないよう, `..` と, ドライブやストリームを表す `:` を含む部分があれば, 失敗にします.
///
/// # Arguments
///
/// * `name` - 項目の名前.
///
/// # Returns
///
/// 相対パス (空のこともある) を包んだ [`Ok`]. 展開先の外を指しうる名前は [`Err`].
pub(crate) fn entry_path(name: &str) -> Result<PathBuf, String> {
    let mut path = PathBuf::new();
    for part in name.split(['/', '\\']) {
        match part {
            "" | "." => {}
            _ if part == ".." || part.contains(':') => {
                return Err(format!("Unsafe path in the archive: {}", name));
            }
            _ => path.push(part),
        }
    }
    Ok(path)
}

/// 項目の種類.
enum EntryKind {
    /// ディレクトリ.
    Dir,
    /// ファイル.
    File,
    /// 書き出さないもの (シンボリックリンク, ハードリンク, デバイスなど).
    Other,
}

/// アーカイブの項目を 1 つ, 展開先へ書き出します.
///
/// ディレクトリは作り, ファイルは中身を書きます (既にあるものは上書きしない).
/// シンボリックリンクなどは, 展開先の外を指しうるので, 書き出しません.
///
/// # Arguments
///
/// * `dest` - 展開先のディレクトリ.
/// * `raw_name` - アーカイブに記録された名前.
/// * `kind` - 項目の種類.
/// * `content` - ファイルの中身.
/// * `mode` - アーカイブに記録された Unix の権限 (無ければ [`None`]).
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
fn write_entry(
    dest: &Path,
    raw_name: &[u8],
    kind: EntryKind,
    content: &mut dyn io::Read,
    mode: Option<u32>,
) -> Result<(), String> {
    let name = entry_name(raw_name);
    let relative = entry_path(&name)?;
    if relative.as_os_str().is_empty() {
        return Ok(());
    }
    let target = dest.join(&relative);
    let fail = |e: io::Error| format!("{}: {}", name, e);
    match kind {
        EntryKind::Dir => fs::create_dir_all(&target).map_err(fail),
        EntryKind::Other => {
            log::warn!("ファイルとディレクトリ以外は展開しません: {}", name);
            Ok(())
        }
        EntryKind::File => {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(fail)?;
            }
            let mut out = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .map_err(fail)?;
            io::copy(content, &mut out).map_err(fail)?;
            set_mode(&target, mode);
            Ok(())
        }
    }
}

/// 展開したファイルに, アーカイブに記録された権限 (読み・書き・実行のみ) を付けます. 失敗しても, 無視します.
///
/// # Arguments
///
/// * `path` - 展開したファイル.
/// * `mode` - アーカイブに記録された Unix の権限 (無ければ [`None`]).
#[cfg(unix)]
fn set_mode(path: &Path, mode: Option<u32>) {
    use std::os::unix::fs::PermissionsExt;
    if let Some(mode) = mode {
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(mode & 0o777));
    }
}

/// 展開したファイルに, アーカイブに記録された権限を付けます (Unix 以外では, 何もしません).
///
/// # Arguments
///
/// * `_path` - 展開したファイル.
/// * `_mode` - アーカイブに記録された Unix の権限.
#[cfg(not(unix))]
fn set_mode(_path: &Path, _mode: Option<u32>) {}

/// zip の全ての項目を, 展開先へ書き出します.
///
/// # Arguments
///
/// * `zip` - zip ファイル.
/// * `dest` - 展開先のディレクトリ.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
fn extract_zip_entries<R: io::Read + io::Seek>(
    zip: &mut ZipArchive<R>,
    dest: &Path,
) -> Result<(), String> {
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(|e| e.to_string())?;
        let kind = if entry.is_dir() {
            EntryKind::Dir
        } else if entry.is_symlink() {
            EntryKind::Other
        } else {
            EntryKind::File
        };
        let raw_name = entry.name_raw().to_vec();
        let mode = entry.unix_mode();
        write_entry(dest, &raw_name, kind, &mut entry, mode)?;
    }
    Ok(())
}

/// tar の全ての項目を, 展開先へ書き出します.
///
/// # Arguments
///
/// * `reader` - tar の中身 (gzip なら, 解いたもの).
/// * `dest` - 展開先のディレクトリ.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
fn extract_tar_entries(reader: impl io::Read, dest: &Path) -> Result<(), String> {
    let mut archive = tar::Archive::new(reader);
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let kind = match entry.header().entry_type() {
            EntryType::Directory => EntryKind::Dir,
            EntryType::Regular | EntryType::Continuous => EntryKind::File,
            _ => EntryKind::Other,
        };
        let raw_name = entry.path_bytes().into_owned();
        let mode = entry.header().mode().ok();
        write_entry(dest, &raw_name, kind, &mut entry, mode)?;
    }
    Ok(())
}

/// 展開先のディレクトリ `dest` を新しく作り, `extract` で書き出します.
///
/// `dest` が既にある場合は, 上書きしないよう, 失敗にします. 書き出しに失敗した場合は, 作った `dest` を消します.
///
/// # Arguments
///
/// * `dest` - 展開先のディレクトリ (まだ無いもの).
/// * `extract` - 書き出す処理.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
fn extract_into(dest: &Path, extract: impl FnOnce() -> Result<(), String>) -> Result<(), String> {
    fs::create_dir(dest).map_err(|e| format!("{}: {}", dest.display(), e))?;
    let result = extract();
    if result.is_err() {
        let _ = fs::remove_dir_all(dest);
    }
    result
}

/// アーカイブ (zip, tar, tar.gz) を, 新しく作るディレクトリ `dest` へ展開します. 形式は, 名前で決めます.
///
/// `dest` が既にある場合は, 上書きしないよう, 失敗にします. 途中で失敗した場合は, 作った `dest` を消します.
///
/// # Arguments
///
/// * `archive` - アーカイブのパス.
/// * `dest` - 展開先のディレクトリ (まだ無いもの).
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
pub fn extract_archive_to(archive: &Path, dest: &Path) -> Result<(), String> {
    let format = archive_format(archive)
        .ok_or_else(|| format!("Unsupported archive: {}", archive.display()))?;
    let reader = io::BufReader::new(fs::File::open(archive).map_err(|e| e.to_string())?);
    match format {
        ArchiveFormat::Zip => {
            // zip は, 展開先を作る前に, 壊れていないかを確かめる
            let mut zip = ZipArchive::new(reader).map_err(|e| e.to_string())?;
            extract_into(dest, || extract_zip_entries(&mut zip, dest))
        }
        ArchiveFormat::TarGz => {
            extract_into(dest, || extract_tar_entries(GzDecoder::new(reader), dest))
        }
        ArchiveFormat::Tar => extract_into(dest, || extract_tar_entries(reader, dest)),
    }
}

/// アーカイブ (zip, tar, tar.gz) を, 指定ディレクトリの直下に新しく作るディレクトリへ展開します.
///
/// # Arguments
///
/// * `path` - アーカイブのパス.
/// * `parent` - 展開先のディレクトリを作る, 親ディレクトリのパス.
/// * `name` - 展開先のディレクトリの名前 (まだ無いもの).
///
/// # Returns
///
/// 成功した場合は [`Ok(())`]. 名前が不正な場合, 展開先が既にある場合, 展開できない形式の場合,
/// アーカイブが壊れている場合などは, エラー文字列を含む [`Err`].
#[tauri::command(async)]
#[specta::specta]
pub fn extract_archive(path: String, parent: String, name: String) -> Result<(), String> {
    let dest = join_valid_name(&parent, &name)?;
    extract_archive_to(Path::new(&path), &dest).map_err(|e| {
        log::error!("展開失敗: {} → {} ({})", path, dest.display(), e);
        e
    })?;
    log::info!("アーカイブの展開: {} → {}", path, dest.display());
    Ok(())
}

#[cfg(test)]
#[path = "../../tests/unit/commands/test_archive.rs"]
mod tests;
