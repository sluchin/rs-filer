use serde::Serialize;
use std::fs;
//use log::{info, error};

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

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

#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "ホームディレクトリを取得できませんでした".to_string())
}
