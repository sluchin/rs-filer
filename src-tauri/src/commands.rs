//! ディレクトリ一覧取得およびシステム基本情報を提供するモジュール。
//!
//! フロントエンド（React）からの IPC 呼び出しを受け取り、ファイルシステムの探索や
//! ホームディレクトリの取得処理を行います。

use serde::Serialize;
use std::fs;
//use log::{info, error};

/// ファイルシステム上の 1 つのエントリ（ファイルまたはディレクトリ）を表す構造体。
#[derive(Serialize)]
pub struct FileEntry {
    /// ファイルまたはディレクトリの名前
    pub name: String,
    /// ファイルシステムの絶対パス
    pub path: String,
    /// ディレクトリの場合は `true`、ファイル等の場合は `false`
    pub is_dir: bool,
}

/// 指定されたパスのディレクトリ内にあるファイル・ディレクトリの一覧を取得します。
///
/// 取得結果はディレクトリが上部、ファイルが下部になるよう並び替えられ、
/// 同種同士は名前の昇順（アルファベット順）でソートされます。
///
/// # Arguments
///
/// * `path` - 読み込み対象となるディレクトリの絶対パス文字列
///
/// # Returns
///
/// 成功した場合は [`FileEntry`] のベクトルを包んだ [`Ok`] を返し、
/// ディレクトリが存在しないかアクセス権限がない場合はエラー文字列を含む [`Err`] を返します。
#[tauri::command]
pub fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    //info!("ディレクトリ読み取り開始: {}", path);
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let metadata = entry.metadata().ok();
        let is_dir = metadata.map(|m| m.is_dir()).unwrap_or(false);

        files.push(FileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: entry.path().to_string_lossy().into_owned(),
            is_dir,
        });
    }

    // フォルダを上、ファイルを下にソート
    files.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(files)
}

/// 実行環境におけるユーザーのホームディレクトリの絶対パスを取得します。
///
/// # Returns
///
/// ホームディレクトリのパス文字列を包んだ [`Ok`]、
/// パスを取得できなかった場合はエラー文字列を含む [`Err`] を返します。
#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "ホームディレクトリを取得できませんでした".to_string())
}
