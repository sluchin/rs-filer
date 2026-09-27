//! ディレクトリ一覧・ホームディレクトリ・ドライブ・ディスク容量など, ファイルシステムの情報を取得するコマンド.

use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

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

/// 補完の候補として返す最大の件数.
const MAX_COMPLETIONS: usize = 200;

/// 入力途中のパスを補完する候補を, 実際のディレクトリの内容から求めます.
///
/// 最後の区切り文字 (`/` または `\`) までをディレクトリ, その後ろを名前の前方一致の条件として扱い,
/// 条件に合うサブディレクトリを, 入力と同じ書き方 (先頭の `~` を含む) の, 末尾に `/` の付いたパスで返します.
/// 名前が `.` で始まる隠しディレクトリは, 条件も `.` で始まる場合だけ返します.
///
/// # Arguments
///
/// * `input` - 入力途中のパス. 区切り文字を含まない場合や空の場合は, 候補なし.
/// * `home` - ホームディレクトリ. 先頭の `~` の展開に使う.
///
/// # Returns
///
/// 名前順に並べた候補 (最大 200 件). ディレクトリを読めない場合は空.
fn complete_path_with(input: &str, home: Option<&Path>) -> Vec<String> {
    let Some(split) = input.rfind(['/', '\\']) else {
        return Vec::new();
    };
    let (typed_dir, prefix) = input.split_at(split + 1);
    let dir = match (typed_dir.strip_prefix('~'), home) {
        (Some(rest), Some(home)) => home.join(rest.trim_start_matches(['/', '\\'])),
        _ => Path::new(typed_dir).to_path_buf(),
    };
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let fold = |s: &str| {
        if cfg!(windows) {
            s.to_lowercase()
        } else {
            s.to_string()
        }
    };
    let wanted = fold(prefix);
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|name| fold(name).starts_with(&wanted))
        .filter(|name| !name.starts_with('.') || prefix.starts_with('.'))
        .collect();
    names.sort();
    names.truncate(MAX_COMPLETIONS);
    names
        .into_iter()
        .map(|name| format!("{}{}/", typed_dir, name))
        .collect()
}

/// 入力途中のパスを補完する候補を返します.
///
/// # Arguments
///
/// * `input` - 入力途中のパス.
///
/// # Returns
///
/// 候補のパス (ディレクトリのみ. 末尾に `/`).
#[tauri::command]
pub fn complete_path(input: String) -> Vec<String> {
    complete_path_with(&input, dirs::home_dir().as_deref())
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
    fn test_complete_path_with_success() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("alpha")).unwrap();
        fs::create_dir_all(dir.path().join("alps")).unwrap();
        fs::create_dir_all(dir.path().join("beta")).unwrap();
        fs::create_dir_all(dir.path().join(".hidden")).unwrap();
        fs::write(dir.path().join("alfile"), "").unwrap();
        let base = format!("{}/", dir.path().display());

        assert_eq!(
            complete_path_with(&format!("{}al", base), None),
            vec![format!("{}alpha/", base), format!("{}alps/", base)]
        );
        assert_eq!(
            complete_path_with(&base, None),
            vec![
                format!("{}alpha/", base),
                format!("{}alps/", base),
                format!("{}beta/", base)
            ]
        );
        assert_eq!(
            complete_path_with(&format!("{}.", base), None),
            vec![format!("{}.hidden/", base)]
        );
    }

    #[test]
    fn test_complete_path_with_home_and_failures() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("docs")).unwrap();

        assert_eq!(
            complete_path_with("~/do", Some(dir.path())),
            vec!["~/docs/".to_string()]
        );
        assert!(complete_path_with("~/do", None).is_empty());
        assert!(complete_path_with("", None).is_empty());
        assert!(complete_path_with("no-separator", None).is_empty());
        assert!(complete_path_with("/non_existent_path_rsfiler_12345/a", None).is_empty());
        assert_eq!(
            complete_path("/non_existent_path_rsfiler_12345/a".into()).len(),
            0
        );
    }

    #[test]
    fn test_complete_path_with_limits_results() {
        let dir = tempdir().unwrap();
        for i in 0..(MAX_COMPLETIONS + 5) {
            fs::create_dir(dir.path().join(format!("d{:04}", i))).unwrap();
        }
        let input = format!("{}/d", dir.path().display());
        assert_eq!(complete_path_with(&input, None).len(), MAX_COMPLETIONS);
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
