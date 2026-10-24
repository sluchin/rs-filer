//! 設定ファイル (キーマップ・アプリ設定) の読み込み・書き込みを行うコマンド.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// キーマップ設定ファイルのファイル名.
const KEYMAP_FILE: &str = "keymap.json";
/// アプリ設定ファイルのファイル名.
const CONFIG_FILE: &str = "config.json";

/// キーマップ設定ファイルのパスを返します.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ.
///
/// # Returns
///
/// `<設定ディレクトリ>/rsfiler/keymap.json`.
fn keymap_path(config_dir: &Path) -> PathBuf {
    config_dir.join("rsfiler").join(KEYMAP_FILE)
}

/// キーマップ設定ファイルを読み込みます.
///
/// ファイルは, キーの並び (`"C-x C-f"`) から, コマンド名への対応を表す JSON のオブジェクトです.
/// 値を `null` にすると, そのキーの割り当てを解除します.
///
/// # Arguments
///
/// * `path` - 設定ファイルのパス.
///
/// # Returns
///
/// 割り当ての一覧. ファイルが無い場合は空. 読み込めない場合や JSON の形式が不正な場合は,
/// エラー文字列を含む [`Err`].
fn read_keymap(path: &Path) -> Result<HashMap<String, Option<String>>, String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(HashMap::new()),
        Err(e) => return Err(format!("Failed to read {}: {}", path.display(), e)),
    };
    serde_json::from_str(&text).map_err(|e| format!("Invalid {}: {}", path.display(), e))
}

/// 設定ディレクトリからキーマップ設定を読み込みます.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
///
/// # Returns
///
/// 割り当ての一覧. 設定ディレクトリが無い場合やファイルが無い場合は空.
/// 失敗した場合はエラー文字列を含む [`Err`].
fn load_keymap_from(config_dir: Option<&Path>) -> Result<HashMap<String, Option<String>>, String> {
    match config_dir {
        Some(dir) => read_keymap(&keymap_path(dir)),
        None => Ok(HashMap::new()),
    }
}

/// ユーザーのキーマップ設定を読み込みます.
///
/// # Returns
///
/// 割り当ての一覧. 設定ファイルが無い場合は空. 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリを読むため, カバレッジの対象外にする (ロジックは load_keymap_from で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub fn load_keymap() -> Result<HashMap<String, Option<String>>, String> {
    load_keymap_from(dirs::config_dir().as_deref()).inspect_err(|e| {
        log::error!("キーマップ設定読み込み失敗: {}", e);
    })
}

/// テーマ (配色).
#[derive(Serialize, Deserialize, Type, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// xyzzy クラシック風の配色 (既定).
    Classic,
    /// 暗い配色.
    Dark,
}

/// フォントサイズ.
#[derive(Serialize, Deserialize, Type, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum FontSize {
    /// 小.
    Small,
    /// 中 (既定).
    Medium,
    /// 大.
    Large,
}

/// ファイル一覧の列幅設定.
#[derive(Serialize, Deserialize, Type, Clone, PartialEq, Debug, Default)]
pub struct ColumnWidths {
    /// ファイル名の列の幅 (px).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub col_name: Option<u32>,
    /// サイズの列の幅 (px).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub col_size: Option<u32>,
    /// 更新日時の列の幅 (px).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub col_date: Option<u32>,
    /// 属性の列の幅 (px).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub col_attr: Option<u32>,
}

/// ペイン毎の列幅設定.
#[derive(Serialize, Deserialize, Type, Clone, PartialEq, Debug, Default)]
pub struct PaneColumnWidths {
    /// 左ペインの列幅.
    #[serde(default)]
    pub left: ColumnWidths,
    /// 右ペインの列幅.
    #[serde(default)]
    pub right: ColumnWidths,
}

/// ウィンドウの状態 (終了時に保存して, 起動時に復元する).
#[derive(Serialize, Deserialize, Type, Clone, PartialEq, Debug)]
pub struct WindowState {
    /// ウィンドウの内側の幅 (論理ピクセル). 最大化していないときの値.
    pub width: u32,
    /// ウィンドウの内側の高さ (論理ピクセル). 最大化していないときの値.
    pub height: u32,
    /// ウィンドウの左上の x 座標 (物理ピクセル). 不明な場合は `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    /// ウィンドウの左上の y 座標 (物理ピクセル). 不明な場合は `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
    /// 最大化している場合は `true`.
    #[serde(default)]
    pub maximized: bool,
}

/// 前回終了時の, 左右のペインのディレクトリ (起動時に復元する).
#[derive(Serialize, Deserialize, Type, Clone, PartialEq, Debug, Default)]
pub struct LastPaths {
    /// 左ペインのディレクトリ.
    pub left: String,
    /// 右ペインのディレクトリ.
    pub right: String,
}

/// アプリケーションの設定.
#[derive(Serialize, Deserialize, Type, Clone, PartialEq, Debug)]
#[serde(default)]
pub struct AppConfig {
    /// テーマ.
    pub theme: Theme,
    /// フォントサイズ.
    pub font_size: FontSize,
    /// エディタのコマンド. 指定が無い場合は環境変数 `VISUAL` / `EDITOR` を使う.
    pub editor: Option<String>,
    /// ターミナルのコマンド. 指定が無い場合は OS ごとの既定のターミナルを順に試す.
    pub terminal: Option<String>,
    /// ファイル一覧の列幅 (ペイン毎).
    #[serde(default)]
    pub pane_column_widths: PaneColumnWidths,
    /// 前回終了時のウィンドウの状態. 保存されていない場合は `None`.
    /// バックエンドが終了時に書き込む. フロントエンドからの保存では上書きしない.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub window: Option<WindowState>,
    /// 前回終了時の, 左右のペインのディレクトリ. 保存されていない場合は `None`.
    /// `save_last_paths` が書き込む. `save_config` では上書きしない.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_paths: Option<LastPaths>,
    /// ディレクトリの移動履歴の, ペインごとの件数の上限 (既定は 1000). 超えたら, 古い方から捨てる.
    /// 利用者が `config.json` を書き換えて変える. `save_config` では上書きしない.
    pub history_limit: usize,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            theme: Theme::Classic,
            font_size: FontSize::Medium,
            editor: None,
            terminal: None,
            pane_column_widths: PaneColumnWidths::default(),
            window: None,
            last_paths: None,
            history_limit: super::history::DEFAULT_HISTORY_LIMIT,
        }
    }
}

/// アプリ設定ファイルのパスを返します.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ.
///
/// # Returns
///
/// `<設定ディレクトリ>/rsfiler/config.json`.
fn config_path(config_dir: &Path) -> PathBuf {
    config_dir.join("rsfiler").join(CONFIG_FILE)
}

/// アプリ設定ファイルを読み込みます. 個々の項目が無い場合は, その項目だけ既定値を使います.
///
/// # Arguments
///
/// * `path` - 設定ファイルのパス.
///
/// # Returns
///
/// 設定. ファイルが無い場合は既定値. 読み込めない場合や JSON の形式が不正な場合は,
/// エラー文字列を含む [`Err`].
fn read_config(path: &Path) -> Result<AppConfig, String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(AppConfig::default()),
        Err(e) => return Err(format!("Failed to read {}: {}", path.display(), e)),
    };
    serde_json::from_str(&text).map_err(|e| format!("Invalid {}: {}", path.display(), e))
}

/// アプリ設定ファイルを書き込みます. 親ディレクトリが無ければ作成します.
///
/// # Arguments
///
/// * `path` - 設定ファイルのパス.
/// * `config` - 書き込む設定.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
fn write_config(path: &Path, config: &AppConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

/// 設定ディレクトリからアプリ設定を読み込みます.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
///
/// # Returns
///
/// 設定. 設定ディレクトリやファイルが無い場合は既定値. 失敗した場合はエラー文字列を含む [`Err`].
pub fn load_config_from(config_dir: Option<&Path>) -> Result<AppConfig, String> {
    match config_dir {
        Some(dir) => read_config(&config_path(dir)),
        None => Ok(AppConfig::default()),
    }
}

/// 設定ディレクトリへアプリ設定を書き込みます.
///
/// ウィンドウの状態 (`window`) と前回のディレクトリ (`last_paths`) は, 別に書くものなので,
/// 渡された設定の値ではなく, 保存されている値を残します (フロントエンドが読み込んだ古い値で, 上書きしないため).
/// 履歴の件数の上限 (`history_limit`) も, 利用者が書き換えるものなので, 保存されている値を残します.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ.
/// * `config` - 書き込む設定.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 設定ディレクトリを取得できない場合や書き込みに失敗した場合は
/// エラー文字列を含む [`Err`].
pub fn save_config_to(config_dir: Option<&Path>, config: &AppConfig) -> Result<(), String> {
    let dir = config_dir.ok_or_else(|| "Config directory is not available".to_string())?;
    let path = config_path(dir);
    let mut merged = config.clone();
    let saved = read_config(&path).ok();
    merged.window = saved.as_ref().and_then(|saved| saved.window.clone());
    if let Some(saved) = &saved {
        merged.history_limit = saved.history_limit;
    }
    merged.last_paths = saved.and_then(|saved| saved.last_paths);
    write_config(&path, &merged)
}

/// 設定ディレクトリの設定ファイルへ, ウィンドウの状態だけを書き込みます. 他の項目は変えません.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
/// * `state` - 書き込むウィンドウの状態.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`]. 設定ディレクトリを取得できない場合, 既存の設定が読み込めない場合
/// (壊れた設定を上書きしないため), 書き込みに失敗した場合は, エラー文字列を含む [`Err`].
pub(crate) fn save_window_state_to(
    config_dir: Option<&Path>,
    state: &WindowState,
) -> Result<(), String> {
    let dir = config_dir.ok_or_else(|| "Config directory is not available".to_string())?;
    let path = config_path(dir);
    let mut config = read_config(&path)?;
    config.window = Some(state.clone());
    write_config(&path, &config)
}

/// 設定ディレクトリの設定ファイルへ, 前回のディレクトリだけを書き込みます. 他の項目は変えません.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
/// * `paths` - 書き込む左右のペインのディレクトリ.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`]. 設定ディレクトリを取得できない場合, 既存の設定が読み込めない場合
/// (壊れた設定を上書きしないため), 書き込みに失敗した場合は, エラー文字列を含む [`Err`].
fn save_last_paths_to(config_dir: Option<&Path>, paths: &LastPaths) -> Result<(), String> {
    let dir = config_dir.ok_or_else(|| "Config directory is not available".to_string())?;
    let path = config_path(dir);
    let mut config = read_config(&path)?;
    config.last_paths = Some(paths.clone());
    write_config(&path, &config)
}

/// ユーザーの設定へ, 左右のペインのディレクトリを書き込みます.
///
/// # Arguments
///
/// * `paths` - 書き込む左右のペインのディレクトリ.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリへ書くため, カバレッジの対象外にする (ロジックは save_last_paths_to で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub fn save_last_paths(paths: LastPaths) -> Result<(), String> {
    save_last_paths_to(dirs::config_dir().as_deref(), &paths).inspect_err(|e| {
        log::error!("前回のディレクトリ書き込み失敗: {}", e);
    })
}

/// ユーザーのアプリ設定を読み込みます.
///
/// # Returns
///
/// 設定. 設定ファイルが無い場合は既定値. 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリを読むため, カバレッジの対象外にする (ロジックは load_config_from で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub fn load_config() -> Result<AppConfig, String> {
    load_config_from(dirs::config_dir().as_deref()).inspect_err(|e| {
        log::error!("アプリ設定読み込み失敗: {}", e);
    })
}

/// ユーザーのアプリ設定を書き込みます.
///
/// # Arguments
///
/// * `config` - 書き込む設定.
///
/// # Returns
///
/// 成功した場合は [`Ok(())`], 失敗した場合はエラー文字列を含む [`Err`].
// 実際のユーザーの設定ディレクトリへ書くため, カバレッジの対象外にする (ロジックは save_config_to で検証する).
#[cfg(not(tarpaulin_include))]
#[tauri::command]
#[specta::specta]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    save_config_to(dirs::config_dir().as_deref(), &config).inspect_err(|e| {
        log::error!("アプリ設定書き込み失敗: {}", e);
    })?;
    log::info!("アプリ設定書き込み完了");
    Ok(())
}

/// 設定ディレクトリから, 前回終了時のウィンドウの状態を読み込みます.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
///
/// # Returns
///
/// 保存されていれば `Some`. 設定が無い場合や読み込めない場合は `None` (既定のウィンドウで開く).
pub fn load_window_state_from(config_dir: Option<&Path>) -> Option<WindowState> {
    load_config_from(config_dir)
        .inspect_err(|e| log::warn!("ウィンドウの状態の読み込み失敗: {}", e))
        .ok()
        .and_then(|config| config.window)
}

/// 設定ディレクトリへ, ウィンドウの状態を書き込みます. 失敗した場合は, 警告をログに出します.
///
/// # Arguments
///
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
/// * `state` - 書き込むウィンドウの状態.
pub fn store_window_state_to(config_dir: Option<&Path>, state: &WindowState) {
    match save_window_state_to(config_dir, state) {
        Ok(()) => log::info!("ウィンドウの状態書き込み完了"),
        Err(e) => log::warn!("ウィンドウの状態書き込み失敗: {}", e),
    }
}

#[cfg(test)]
#[path = "../../tests/unit/commands/config_test.rs"]
mod tests;
