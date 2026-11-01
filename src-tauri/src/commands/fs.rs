//! ディレクトリ一覧・ホームディレクトリ・ドライブ・ディスク容量など, ファイルシステムの情報を取得するコマンド.

use serde::Serialize;
use specta::Type;
use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// ファイルシステム上の 1 つのエントリ（ファイルまたはディレクトリ）を表す構造体.
#[derive(Debug, Serialize, Type)]
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
    unix_secs(metadata.modified().ok()?)
}

/// システム時刻を, UNIX 時刻の秒に変換します.
///
/// # Arguments
///
/// * `time` - 変換する時刻.
///
/// # Returns
///
/// UNIX 時刻の秒 (1970 年より前は負). 範囲を超える場合は `None`.
pub(crate) fn unix_secs(time: std::time::SystemTime) -> Option<i64> {
    match time.duration_since(UNIX_EPOCH) {
        Ok(d) => i64::try_from(d.as_secs()).ok(),
        Err(e) => i64::try_from(e.duration().as_secs()).ok().map(|n| -n),
    }
}

/// メタデータの隠し属性を判定します. Windows.
///
/// # Arguments
///
/// * `_name` - エントリの名前 (Windows では使わない).
/// * `metadata` - 対象のメタデータ.
///
/// # Returns
///
/// 隠し属性 (`FILE_ATTRIBUTE_HIDDEN`) が付いている場合は `true`.
#[cfg(windows)]
pub(crate) fn is_hidden(_name: &str, metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes() & 0x2 != 0
}

/// メタデータの隠し属性を判定します. Windows 以外.
///
/// # Arguments
///
/// * `name` - エントリの名前.
/// * `_metadata` - 対象のメタデータ (Windows 以外では使わない).
///
/// # Returns
///
/// 名前が `.` で始まる場合は `true`.
#[cfg(not(windows))]
pub(crate) fn is_hidden(name: &str, _metadata: &fs::Metadata) -> bool {
    name.starts_with('.')
}

/// 指定されたパスのディレクトリ内にあるファイル・ディレクトリの一覧を取得します.
///
/// 並べ替えはしません (表示の設定に合わせて, フロントエンドで並べ替えるため). 順序は読んだ順のままです.
/// シンボリックリンクは, リンク先の種類 (ディレクトリかファイルか)・サイズ・更新日時で表します.
///
/// # Arguments
///
/// * `path` - 読み込み対象となるディレクトリの絶対パス文字列.
///
/// # Returns
///
/// 成功した場合は [`FileEntry`] のベクトルを包んだ [`Ok`] を返し,
/// ディレクトリが存在しないかアクセス権限がない場合はエラー文字列を含む [`Err`] を返します.
fn scan_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        // 項目そのもの (シンボリックリンクならリンク自身) の情報. 隠し属性はこちらで判定する.
        let own = entry.metadata().ok();
        // シンボリックリンクはリンク先の情報を使う (ディレクトリへのリンクをディレクトリとして扱うため).
        // リンク先が無い場合は, リンク自身の情報を使う.
        let metadata = fs::metadata(entry.path()).ok().or_else(|| own.clone());

        files.push(FileEntry {
            path: entry.path().to_string_lossy().into_owned(),
            is_dir: metadata.as_ref().is_some_and(|m| m.is_dir()),
            size: metadata.as_ref().map_or(0, |m| m.len()),
            modified: metadata.as_ref().and_then(modified_secs),
            readonly: metadata
                .as_ref()
                .is_some_and(|m| m.permissions().readonly()),
            hidden: own.as_ref().is_some_and(|m| is_hidden(&name, m)),
            name,
        });
    }

    // 並べ替えは, 表示の設定 (基準・向き) を持つフロントエンドで行う. ここでは読んだ順のまま返す.
    Ok(files)
}

/// 指定されたパスのディレクトリ内にあるファイル・ディレクトリの一覧を取得します.
///
/// 走査 (ディスク I/O) はブロッキング用のスレッドで実行し, IPC を処理するスレッドを塞ぎません.
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
#[specta::specta]
pub async fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    log::debug!("ディレクトリ読み取り開始: {}", path);
    let target = path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || scan_directory(&target))
        .await
        .map_err(|e| e.to_string())?;
    if let Err(e) = &result {
        log::error!("ディレクトリ読み取り失敗: {} ({})", path, e);
    }
    result
}

/// ディレクトリの直下に, 表示対象のエントリが 1 つでもあるかを調べます.
///
/// 読み取れないディレクトリ (存在しない・権限がない) は, 中身が無いものとして扱います.
///
/// # Arguments
///
/// * `path` - 調べるディレクトリの絶対パス文字列.
/// * `show_hidden` - `true` の場合は隠しファイルも数え, `false` の場合は隠しファイルを数えません.
///
/// # Returns
///
/// 表示対象のエントリが 1 つ以上あれば `true`.
fn dir_has_entries(path: &str, show_hidden: bool) -> bool {
    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    entries.flatten().any(|entry| {
        if show_hidden {
            return true;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        !entry
            .metadata()
            .ok()
            .is_some_and(|metadata| is_hidden(&name, &metadata))
    })
}

/// 複数のディレクトリについて, 直下に表示対象のエントリがあるかを, まとめて調べます.
///
/// ツリー表示で, 配下に何も無いディレクトリの展開マークを消すために使います. 走査 (ディスク I/O) は
/// ブロッキング用のスレッドで実行します.
///
/// # Arguments
///
/// * `paths` - 調べるディレクトリの絶対パス文字列の配列.
/// * `show_hidden` - `true` の場合は隠しファイルも数えます.
///
/// # Returns
///
/// `paths` と同じ順序の, エントリの有無の配列 (あれば `true`).
/// 走査のスレッドが異常終了した場合はエラー文字列を含む [`Err`] を返します.
#[tauri::command]
#[specta::specta]
pub async fn dirs_have_entries(paths: Vec<String>, show_hidden: bool) -> Result<Vec<bool>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|path| dir_has_entries(path, show_hidden))
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

/// 再帰検索の結果.
#[derive(Debug, Serialize, Type)]
pub struct SearchResult {
    /// 名前が合ったエントリ. `name` は, 検索を始めたディレクトリからの相対パス (区切りは `/`).
    pub entries: Vec<FileEntry>,
    /// 件数の上限に達して, 探すのを打ち切った場合は `true`.
    pub truncated: bool,
}

/// 名前が, 検索の入力に合うかを調べます.
///
/// `*` か `?` を含む入力は, ワイルドカードとして, 名前の全体に合うかを調べます (`*.txt` など).
/// 含まない入力は, 名前の一部に合うかを調べます. どちらも, 大文字小文字を区別しません.
///
/// # Arguments
///
/// * `query` - 検索の入力.
/// * `name` - エントリの名前.
///
/// # Returns
///
/// 合えば `true`.
fn name_matches(query: &str, name: &str) -> bool {
    let query: Vec<char> = query.to_lowercase().chars().collect();
    let name = name.to_lowercase();
    if query.iter().any(|c| matches!(c, '*' | '?')) {
        let name: Vec<char> = name.chars().collect();
        glob_matches(&query, &name)
    } else {
        name.contains(&query.iter().collect::<String>())
    }
}

/// ワイルドカード (`*` は 0 文字以上, `?` は 1 文字) が, 名前の全体に合うかを調べます.
///
/// # Arguments
///
/// * `pattern` - パターンの文字列.
/// * `name` - 名前の文字列.
///
/// # Returns
///
/// 合えば `true`.
fn glob_matches(pattern: &[char], name: &[char]) -> bool {
    match pattern.split_first() {
        None => name.is_empty(),
        Some(('*', rest)) => (0..=name.len()).any(|skip| glob_matches(rest, &name[skip..])),
        Some((c, rest)) => name
            .split_first()
            .is_some_and(|(n, tail)| (*c == '?' || c == n) && glob_matches(rest, tail)),
    }
}

/// ディレクトリの下を, 浅い階層から順に歩いて, 条件に合うエントリを集めます.
///
/// 隠しファイルを除くときは, 隠しディレクトリの中にも入りません. シンボリックリンクは, 項目としては
/// 調べますが, リンク先には入りません (輪になったリンクで終わらなくなるのを防ぐため).
/// 読めないサブディレクトリは, 飛ばします.
///
/// # Arguments
///
/// * `root` - 歩き始めるディレクトリの絶対パス文字列.
/// * `show_hidden` - `true` の場合は隠しファイルも歩く.
/// * `max_results` - 集める件数の上限.
/// * `accept` - エントリ (名前, パス, ディレクトリか) が条件に合うかを返す関数.
///
/// # Returns
///
/// 結果を包んだ [`Ok`]. `name` は, `root` からの相対パス (区切りは `/`). `root` を読めない場合はエラー文字列を
/// 含む [`Err`].
fn walk_tree(
    root: &str,
    show_hidden: bool,
    max_results: usize,
    mut accept: impl FnMut(&str, &Path, bool) -> bool,
) -> Result<SearchResult, String> {
    let root_path = Path::new(root);
    // 最初のディレクトリが読めないときは, エラーにする (サブディレクトリは, 読めなければ飛ばす)
    let mut queue = VecDeque::from([root_path.to_path_buf()]);
    let mut entries = Vec::new();
    let mut first = true;
    while let Some(dir) = queue.pop_front() {
        let read = match fs::read_dir(&dir) {
            Ok(read) => read,
            Err(e) if first => return Err(e.to_string()),
            Err(_) => continue,
        };
        first = false;
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let own = entry.metadata().ok();
            let hidden = own.as_ref().is_some_and(|m| is_hidden(&name, m));
            if hidden && !show_hidden {
                continue;
            }
            let path = entry.path();
            let metadata = fs::metadata(&path).ok().or_else(|| own.clone());
            let is_dir = metadata.as_ref().is_some_and(|m| m.is_dir());
            let is_link = entry.file_type().is_ok_and(|t| t.is_symlink());
            if is_dir && !is_link {
                queue.push_back(path.clone());
            }
            if !accept(&name, &path, is_dir) {
                continue;
            }
            if entries.len() >= max_results {
                return Ok(SearchResult {
                    entries,
                    truncated: true,
                });
            }
            let relative = path
                .strip_prefix(root_path)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            entries.push(FileEntry {
                path: path.to_string_lossy().into_owned(),
                is_dir,
                size: metadata.as_ref().map_or(0, |m| m.len()),
                modified: metadata.as_ref().and_then(modified_secs),
                readonly: metadata
                    .as_ref()
                    .is_some_and(|m| m.permissions().readonly()),
                hidden,
                name: relative,
            });
        }
    }
    Ok(SearchResult {
        entries,
        truncated: false,
    })
}

/// ディレクトリの下から, 名前が合うエントリを集めます (`find-name-dired`).
///
/// # Arguments
///
/// * `root` - 探し始めるディレクトリの絶対パス文字列.
/// * `query` - 名前の一部か, ワイルドカード (`name_matches` を参照). 空文字列なら, すべてに合う.
/// * `show_hidden` - `true` の場合は隠しファイルも探す.
/// * `max_results` - 集める件数の上限.
///
/// # Returns
///
/// 結果を包んだ [`Ok`]. `root` を読めない場合はエラー文字列を含む [`Err`].
fn search_tree(
    root: &str,
    query: &str,
    show_hidden: bool,
    max_results: usize,
) -> Result<SearchResult, String> {
    walk_tree(root, show_hidden, max_results, |name, _, _| {
        name_matches(query, name)
    })
}

/// 内容を調べるファイルの大きさの上限 (バイト). これより大きいファイルは飛ばす.
const GREP_MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;

/// バイナリかを見分けるために読む先頭のバイト数.
const BINARY_SNIFF_BYTES: usize = 8000;

/// ファイルの中身が, 正規表現に合うかを調べます. 読めないファイル, 大きすぎるファイル, バイナリは, 合わないものとします.
///
/// # Arguments
///
/// * `path` - ファイルのパス.
/// * `regex` - 正規表現.
///
/// # Returns
///
/// 合えば `true`.
fn file_contains(path: &Path, regex: &regex::Regex) -> bool {
    let too_big = fs::metadata(path).map_or(true, |m| m.len() > GREP_MAX_FILE_SIZE);
    if too_big {
        return false;
    }
    let Ok(bytes) = fs::read(path) else {
        return false;
    };
    // 先頭に NUL バイトがあるものは, バイナリとして飛ばす
    if bytes.iter().take(BINARY_SNIFF_BYTES).any(|b| *b == 0) {
        return false;
    }
    regex.is_match(&String::from_utf8_lossy(&bytes))
}

/// ディレクトリの下のファイルから, 中身が正規表現に合うものを集めます (`find-grep-dired`).
///
/// 大文字小文字は区別します (正規表現の中で `(?i)` を付ければ区別しません).
///
/// # Arguments
///
/// * `root` - 探し始めるディレクトリの絶対パス文字列.
/// * `pattern` - 正規表現.
/// * `show_hidden` - `true` の場合は隠しファイルも探す.
/// * `max_results` - 集める件数の上限.
///
/// # Returns
///
/// 結果を包んだ [`Ok`]. 正規表現が不正な場合と, `root` を読めない場合はエラー文字列を含む [`Err`].
fn grep_tree(
    root: &str,
    pattern: &str,
    show_hidden: bool,
    max_results: usize,
) -> Result<SearchResult, String> {
    let regex = regex::Regex::new(pattern).map_err(|e| e.to_string())?;
    walk_tree(root, show_hidden, max_results, |_, path, is_dir| {
        !is_dir && file_contains(path, &regex)
    })
}

/// ディレクトリの下を再帰的に探して, 名前が合うエントリの一覧を返します.
///
/// 走査 (ディスク I/O) はブロッキング用のスレッドで実行し, IPC を処理するスレッドを塞ぎません.
///
/// # Arguments
///
/// * `path` - 探し始めるディレクトリの絶対パス文字列.
/// * `query` - 名前の一部か, ワイルドカード (`*.txt` など). 大文字小文字を区別しない.
/// * `show_hidden` - `true` の場合は隠しファイルも探します.
/// * `max_results` - 集める件数の上限.
///
/// # Returns
///
/// 成功した場合は [`SearchResult`] を包んだ [`Ok`] を返し,
/// ディレクトリを読めない場合や, 走査のスレッドが異常終了した場合はエラー文字列を含む [`Err`] を返します.
#[tauri::command]
#[specta::specta]
pub async fn search_directory(
    path: String,
    query: String,
    show_hidden: bool,
    max_results: u32,
) -> Result<SearchResult, String> {
    log::debug!("再帰検索開始: {} ({})", path, query);
    let target = path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        search_tree(&path, &query, show_hidden, max_results as usize)
    })
    .await
    .map_err(|e| format!("再帰検索のスレッドが異常終了: {e}"))?;
    match &result {
        Ok(r) => log::debug!("再帰検索完了: {} ({} 件)", target, r.entries.len()),
        Err(e) => log::error!("再帰検索失敗: {} ({})", target, e),
    }
    result
}

/// ディレクトリの下のファイルを再帰的に探して, 中身が正規表現に合うファイルの一覧を返します.
///
/// 走査とファイルの読み込み (ディスク I/O) はブロッキング用のスレッドで実行します.
/// 10 MiB より大きいファイルと, バイナリのファイルは飛ばします.
///
/// # Arguments
///
/// * `path` - 探し始めるディレクトリの絶対パス文字列.
/// * `pattern` - 正規表現.
/// * `show_hidden` - `true` の場合は隠しファイルも探します.
/// * `max_results` - 集める件数の上限.
///
/// # Returns
///
/// 成功した場合は [`SearchResult`] を包んだ [`Ok`] を返し,
/// 正規表現が不正な場合, ディレクトリを読めない場合, 走査のスレッドが異常終了した場合はエラー文字列を含む
/// [`Err`] を返します.
#[tauri::command]
#[specta::specta]
pub async fn search_contents(
    path: String,
    pattern: String,
    show_hidden: bool,
    max_results: u32,
) -> Result<SearchResult, String> {
    log::debug!("内容の検索開始: {} ({})", path, pattern);
    let target = path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        grep_tree(&path, &pattern, show_hidden, max_results as usize)
    })
    .await
    .map_err(|e| format!("内容の検索のスレッドが異常終了: {e}"))?;
    match &result {
        Ok(r) => log::debug!("内容の検索完了: {} ({} 件)", target, r.entries.len()),
        Err(e) => log::error!("内容の検索失敗: {} ({})", target, e),
    }
    result
}

/// 実行環境におけるユーザーのホームディレクトリの絶対パスを取得します.
///
/// # Returns
///
/// ホームディレクトリのパス文字列を包んだ [`Ok`],
/// パスを取得できなかった場合はエラー文字列を含む [`Err`] を返します.
#[tauri::command]
#[specta::specta]
pub fn get_home_dir() -> Result<String, String> {
    home_dir_string(dirs::home_dir())
}

/// ホームディレクトリのパスを, 文字列にします.
///
/// # Arguments
///
/// * `home` - ホームディレクトリ. 取得できなかった場合は `None`.
///
/// # Returns
///
/// パス文字列を包んだ [`Ok`]. `home` が `None` の場合はエラー文字列を含む [`Err`].
fn home_dir_string(home: Option<PathBuf>) -> Result<String, String> {
    home.map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| {
            let message = "ホームディレクトリを取得できませんでした.".to_string();
            log::error!("{}", message);
            message
        })
}

/// 利用可能なドライブのルートパスを返します.
///
/// Windows では存在するドライブレター (`C:/` など), それ以外の OS ではルート (`/`) のみを返します.
///
/// # Returns
///
/// ルートパスの一覧.
#[tauri::command(async)]
#[specta::specta]
pub fn list_drives() -> Vec<String> {
    drives_from(candidate_roots(), |p| Path::new(p).exists())
}

/// ディスクの空き容量と全体の容量を表す構造体.
#[derive(Serialize, Type, Debug, PartialEq)]
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
#[tauri::command(async)]
#[specta::specta]
pub fn get_disk_space(path: String) -> Result<DiskSpace, String> {
    let free = disk_space_of(&path, |p| fs4::available_space(p))?;
    let total = disk_space_of(&path, |p| fs4::total_space(p))?;
    Ok(DiskSpace { free, total })
}

/// ディスクの容量 (空き容量か全体の容量) を, `query` で調べます. 失敗したらログに残します.
///
/// # Arguments
///
/// * `path` - 調べるパス.
/// * `query` - 容量を調べる関数 (`fs4::available_space` など).
///
/// # Returns
///
/// 容量 (バイト). 失敗した場合はエラー文字列を含む [`Err`].
fn disk_space_of(path: &str, query: fn(&str) -> std::io::Result<u64>) -> Result<u64, String> {
    query(path).map_err(|e| {
        log::error!("ディスク容量取得失敗: {} ({})", path, e);
        e.to_string()
    })
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
    // 区切り文字より前をディレクトリ (表示のまま残す), 後ろを絞り込み条件の前方一致文字列として扱う.
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
    let wanted = fold(prefix);
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|name| fold(name).starts_with(&wanted))
        // 隠しディレクトリは, 絞り込み条件自体が `.` から始まる場合だけ候補にする.
        .filter(|name| !name.starts_with('.') || prefix.starts_with('.'))
        .collect();
    names.sort();
    names.truncate(MAX_COMPLETIONS);
    // 入力と同じ書き方 (`~` を展開しない) のディレクトリ部分に, 見つかった名前をつなげて返す.
    names
        .into_iter()
        .map(|name| format!("{}{}/", typed_dir, name))
        .collect()
}

/// 入力途中のパスを補完する候補を返します (IPC コマンド).
///
/// 先頭の `~` は, ユーザーのホームディレクトリとして扱います.
///
/// # Arguments
///
/// * `input` - 入力途中のパス.
///
/// # Returns
///
/// 候補のパス (ディレクトリのみ. 末尾に `/`). 詳細は `complete_path_with` を参照.
#[tauri::command(async)]
#[specta::specta]
pub fn complete_path(input: String) -> Vec<String> {
    complete_path_with(&input, dirs::home_dir().as_deref())
}

/// 現在の OS で調べるルートパスの候補を返します.
///
/// # Returns
///
/// Windows では `A:/` から `Z:/`.
#[cfg(windows)]
fn candidate_roots() -> Vec<String> {
    ('A'..='Z').map(|c| format!("{}:/", c)).collect()
}

/// 現在の OS で調べるルートパスの候補を返します.
///
/// # Returns
///
/// Windows 以外の OS では `/`.
#[cfg(not(windows))]
fn candidate_roots() -> Vec<String> {
    vec!["/".to_string()]
}

/// 名前を比べるために, 大文字小文字をそろえます.
///
/// Windows は大文字小文字を区別しないファイルシステムのため, 小文字へそろえます.
///
/// # Arguments
///
/// * `s` - 名前.
///
/// # Returns
///
/// 小文字にした名前.
#[cfg(windows)]
fn fold(s: &str) -> String {
    s.to_lowercase()
}

/// 名前を比べるために, 大文字小文字をそろえます.
///
/// Windows 以外では大文字小文字を区別するので, そのまま返します.
///
/// # Arguments
///
/// * `s` - 名前.
///
/// # Returns
///
/// 元の名前.
#[cfg(not(windows))]
fn fold(s: &str) -> String {
    s.to_string()
}

/// 候補のうち, `exists` が真を返すものだけを残します.
///
/// # Arguments
///
/// * `candidates` - ルートパスの候補.
/// * `exists` - パスが存在するかを調べる関数.
///
/// # Returns
///
/// 存在するルートパスの一覧.
fn drives_from(candidates: Vec<String>, exists: impl Fn(&str) -> bool) -> Vec<String> {
    candidates.into_iter().filter(|p| exists(p)).collect()
}

#[cfg(test)]
#[path = "../../tests/unit/commands/test_fs.rs"]
mod tests;
