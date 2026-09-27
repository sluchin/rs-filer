//! ディレクトリ一覧取得およびファイル操作, システム基本情報を提供するモジュール.
//!
//! フロントエンド（React）からの IPC 呼び出しを受け取り, ファイルシステムの探索や
//! ホームディレクトリの取得, ファイルのコピー・作成・名前変更・削除・起動を行います.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;
//use log::{info, error};

/// ファイルシステム上の 1 つのエントリ（ファイルまたはディレクトリ）を表す構造体.
#[derive(Serialize)]
pub struct FileEntry {
    /// ファイルまたはディレクトリの名前.
    pub name: String,
    /// ファイルシステムの絶対パス.
    pub path: String,
    /// ディレクトリの場合は `true`, ファイル等の場合は `false`.
    pub is_dir: bool,
    /// ファイルサイズ (バイト). ディレクトリでは意味を持たない.
    pub size: u64,
    /// 最終更新日時 (UNIX 時刻の秒). 取得できない場合は `None`.
    pub modified: Option<i64>,
    /// 読み取り専用の場合は `true`.
    pub readonly: bool,
    /// 隠しファイルの場合は `true` (Unix では名前が `.` で始まるもの, Windows では隠し属性).
    pub hidden: bool,
}

/// メタデータの最終更新日時を, UNIX 時刻の秒に変換します.
///
/// # Arguments
///
/// * `metadata` - 対象のメタデータ.
///
/// # Returns
///
/// UNIX 時刻の秒. 取得できない場合は `None`.
fn modified_secs(metadata: &fs::Metadata) -> Option<i64> {
    let time = metadata.modified().ok()?;
    match time.duration_since(UNIX_EPOCH) {
        Ok(d) => i64::try_from(d.as_secs()).ok(),
        Err(e) => i64::try_from(e.duration().as_secs()).ok().map(|n| -n),
    }
}

/// メタデータの隠し属性を判定します.
///
/// # Arguments
///
/// * `name` - エントリの名前.
/// * `metadata` - 対象のメタデータ.
///
/// # Returns
///
/// 隠しファイルの場合は `true`.
#[cfg(not(tarpaulin_include))]
fn is_hidden(name: &str, metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        let _ = name;
        metadata.file_attributes() & 0x2 != 0
    }
    #[cfg(not(windows))]
    {
        let _ = metadata;
        name.starts_with('.')
    }
}

/// 指定されたパスのディレクトリ内にあるファイル・ディレクトリの一覧を取得します.
///
/// 取得結果はディレクトリが上部, ファイルが下部になるよう並び替えられ,
/// 同種同士は名前の昇順（アルファベット順）でソートされます.
///
/// # Arguments
///
/// * `path` - 読み込み対象となるディレクトリの絶対パス文字列.
///
/// # Returns
///
/// 成功した場合は [`FileEntry`] のベクトルを包んだ [`Ok`] を返し,
/// ディレクトリが存在しないかアクセス権限がない場合はエラー文字列を含む [`Err`] を返します.
#[tauri::command]
pub fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    //info!("ディレクトリ読み取り開始: {}", path);
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let metadata = entry.metadata().ok();

        files.push(FileEntry {
            path: entry.path().to_string_lossy().into_owned(),
            is_dir: metadata.as_ref().is_some_and(|m| m.is_dir()),
            size: metadata.as_ref().map_or(0, |m| m.len()),
            modified: metadata.as_ref().and_then(modified_secs),
            readonly: metadata
                .as_ref()
                .is_some_and(|m| m.permissions().readonly()),
            hidden: metadata.as_ref().is_some_and(|m| is_hidden(&name, m)),
            name,
        });
    }

    // フォルダを上, ファイルを下にソート.
    files.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(files)
}

/// 実行環境におけるユーザーのホームディレクトリの絶対パスを取得します.
///
/// # Returns
///
/// ホームディレクトリのパス文字列を包んだ [`Ok`],
/// パスを取得できなかった場合はエラー文字列を含む [`Err`] を返します.
#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "ホームディレクトリを取得できませんでした.".to_string())
}

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

/// OS の関連付けられたアプリケーションでパスを開きます.
///
/// # Arguments
///
/// * `path` - 開く対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
#[cfg(not(tarpaulin_include))]
fn system_open(path: &Path) -> Result<(), String> {
    open::that(path).map_err(|e| e.to_string())
}

/// 対象の存在を確認してから, 渡された `opener` でパスを開きます.
///
/// # Arguments
///
/// * `path` - 開く対象のパス.
/// * `opener` - パスを開く関数.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 対象が存在しない場合や起動に失敗した場合はエラー文字列を含む [`Err`].
fn open_with(path: &Path, opener: impl FnOnce(&Path) -> Result<(), String>) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }
    opener(path)
}

/// 関連付けられた外部アプリケーションでファイルまたはディレクトリを開きます.
///
/// # Arguments
///
/// * `path` - 開く対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command]
pub fn open_item(path: String) -> Result<(), String> {
    open_with(Path::new(&path), system_open)
}

/// 指定したエディタでファイルを開きます. エディタが未指定の場合は OS の既定のアプリケーションを使います.
///
/// # Arguments
///
/// * `path` - 開く対象のパス.
/// * `editor` - エディタのコマンド名. `None` または空文字の場合は既定のアプリケーション.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 対象が存在しない場合やエディタの起動に失敗した場合は
/// エラー文字列を含む [`Err`].
fn open_in_editor_with(path: &Path, editor: Option<&str>) -> Result<(), String> {
    match editor.map(str::trim).filter(|e| !e.is_empty()) {
        Some(cmd) => open_with(path, |p| {
            Command::new(cmd)
                .arg(p)
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to start editor '{}': {}", cmd, e))
        }),
        None => open_with(path, system_open),
    }
}

/// 環境変数 `VISUAL` または `EDITOR` のエディタでファイルを開きます.
///
/// どちらも未設定の場合は OS の既定のアプリケーションで開きます.
///
/// # Arguments
///
/// * `path` - 開く対象のパス.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command]
pub fn open_in_editor(path: String) -> Result<(), String> {
    let editor = std::env::var("VISUAL")
        .or_else(|_| std::env::var("EDITOR"))
        .ok();
    open_in_editor_with(Path::new(&path), editor.as_deref())
}

/// 利用可能なドライブのルートパスを返します.
///
/// Windows では存在するドライブレター (`C:/` など), それ以外の OS ではルート (`/`) のみを返します.
///
/// # Returns
///
/// ルートパスの一覧.
#[tauri::command]
pub fn list_drives() -> Vec<String> {
    drives_from(candidate_roots(), |p| Path::new(p).exists())
}

/// ディスクの空き容量と全体の容量を表す構造体.
#[derive(Serialize, Debug, PartialEq)]
pub struct DiskSpace {
    /// 利用可能な空き容量 (バイト).
    pub free: u64,
    /// 全体の容量 (バイト).
    pub total: u64,
}

/// 指定したパスが載っているディスクの空き容量と全体の容量を取得します.
///
/// # Arguments
///
/// * `path` - 調べるパス (ディスク上の任意のパス).
///
/// # Returns
///
/// 成功した場合は [`DiskSpace`], 取得に失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command]
pub fn get_disk_space(path: String) -> Result<DiskSpace, String> {
    let free = fs4::available_space(&path).map_err(|e| e.to_string())?;
    let total = fs4::total_space(&path).map_err(|e| e.to_string())?;
    Ok(DiskSpace { free, total })
}

/// 現在の OS で調べるルートパスの候補を返します.
fn candidate_roots() -> Vec<String> {
    if cfg!(windows) {
        ('A'..='Z').map(|c| format!("{}:/", c)).collect()
    } else {
        vec!["/".to_string()]
    }
}

/// 候補のうち, `exists` が真を返すものだけを残します.
fn drives_from(candidates: Vec<String>, exists: impl Fn(&str) -> bool) -> Vec<String> {
    candidates.into_iter().filter(|p| exists(p)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_read_directory_metadata_success() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.txt"), "hello").unwrap();
        fs::write(dir.path().join(".hidden"), "").unwrap();
        let ro = dir.path().join("ro.txt");
        fs::write(&ro, "").unwrap();
        let mut perm = fs::metadata(&ro).unwrap().permissions();
        perm.set_readonly(true);
        fs::set_permissions(&ro, perm).unwrap();

        let files = read_directory(dir.path().to_string_lossy().into_owned()).unwrap();
        let get = |n: &str| files.iter().find(|f| f.name == n).unwrap();

        assert_eq!(get("a.txt").size, 5);
        assert!(get("a.txt").modified.unwrap() > 0);
        assert!(!get("a.txt").readonly);
        assert!(!get("a.txt").hidden);
        assert!(get("ro.txt").readonly);
        assert!(get(".hidden").hidden == cfg!(not(windows)));
    }

    #[test]
    fn test_modified_secs_before_epoch() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("old");
        let f = fs::File::create(&file).unwrap();
        f.set_modified(UNIX_EPOCH - std::time::Duration::from_secs(60))
            .unwrap();
        assert_eq!(modified_secs(&fs::metadata(&file).unwrap()), Some(-60));
    }

    #[test]
    fn test_get_disk_space_success() {
        let dir = tempdir().unwrap();
        let space = get_disk_space(dir.path().to_string_lossy().into_owned()).unwrap();
        assert!(space.total > 0);
        assert!(space.free <= space.total);
    }

    #[test]
    fn test_get_disk_space_missing_failure() {
        assert!(get_disk_space("/non_existent_path_rsfiler_12345".to_string()).is_err());
    }

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

    #[test]
    fn test_open_with_success() {
        let dir = tempdir().unwrap();
        let mut opened = None;
        open_with(dir.path(), |p| {
            opened = Some(p.to_path_buf());
            Ok(())
        })
        .unwrap();
        assert_eq!(opened.as_deref(), Some(dir.path()));
    }

    #[test]
    fn test_open_with_missing_failure() {
        let dir = tempdir().unwrap();
        let result = open_with(&dir.path().join("none"), |_| panic!("呼ばれないこと"));
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn test_open_in_editor_with_editor_success() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("f.txt");
        fs::write(&file, "x").unwrap();
        // テスト実行ファイル自身を「エディタ」として起動する (引数はテスト名フィルタとして扱われ, すぐ終了する)
        let exe = std::env::current_exe().unwrap();
        open_in_editor_with(&file, Some(exe.to_str().unwrap())).unwrap();
    }

    #[test]
    fn test_open_in_editor_with_editor_failure() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("f.txt");
        fs::write(&file, "x").unwrap();
        let result = open_in_editor_with(&file, Some("rsfiler-no-such-editor"));
        assert!(result.unwrap_err().contains("Failed to start editor"));
    }

    #[test]
    fn test_open_in_editor_with_default_app_failure() {
        // エディタ未指定 (空文字を含む) の場合は既定のアプリ経路になる. 対象が無いので起動前にエラーになる
        let dir = tempdir().unwrap();
        let missing = dir.path().join("none");
        for editor in [None, Some("  ")] {
            let result = open_in_editor_with(&missing, editor);
            assert!(result.unwrap_err().contains("does not exist"));
        }
    }

    #[test]
    fn test_drives_from_success() {
        let result = drives_from(vec!["A:/".to_string(), "C:/".to_string()], |p| p == "C:/");
        assert_eq!(result, vec!["C:/".to_string()]);
    }

    #[test]
    fn test_candidate_roots_success() {
        let roots = candidate_roots();
        if cfg!(windows) {
            assert_eq!(roots.len(), 26);
            assert_eq!(roots[0], "A:/");
        } else {
            assert_eq!(roots, vec!["/".to_string()]);
        }
    }
}
