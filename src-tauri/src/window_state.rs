//! ウィンドウの大きさ・位置・最大化の状態を, 終了時に保存して, 起動時に復元するモジュール.
//!
//! 保存先は, アプリ設定ファイル (`config.json`) の `window` です (`commands::config`).
//! 保存と復元の処理は, ウィンドウの操作を `WindowOps` に, 環境変数の読み書きを関数に分けて, `cargo test` で
//! 検証します. 実際の `WebviewWindow` に `WindowOps` を実装する部分と, 実際の設定ディレクトリ・環境変数を
//! 渡す入口 (`save`・`restore`・`prefer_x11`) だけが, Tauri と実行環境に依存します.

use crate::commands::config::{load_window_state_from, store_window_state_to, WindowState};
use std::path::Path;
use tauri::{Manager, WebviewWindow};

/// 復元するウィンドウの内側の幅・高さの最小値 (論理ピクセル). これより小さい保存値は, 不正として扱う.
const MIN_SIZE: (u32, u32) = (400, 300);
/// 復元するウィンドウの内側の幅・高さの最大値 (論理ピクセル). これより大きい保存値は, 不正として扱う.
const MAX_SIZE: (u32, u32) = (16384, 16384);
/// 最大化しているときに, 通常の大きさが分からない場合に使う大きさ (`tauri.conf.json` の既定と同じ).
const DEFAULT_SIZE: (u32, u32) = (800, 600);
/// ウィンドウの左上が, 画面の端からこれだけ内側にあれば, 画面の中にあるとみなす (物理ピクセル).
/// 画面の端ぎりぎりでは, タイトルバーを掴めないため.
const VISIBLE_MARGIN: i32 = 50;

/// 環境変数の値が, 空でなく設定されているかを判定します.
///
/// # Arguments
///
/// * `value` - 環境変数の値. 設定されていない場合は `None`.
///
/// # Returns
///
/// 設定されていて, 空でない場合は `true`.
fn is_set(value: Option<&str>) -> bool {
    value.is_some_and(|v| !v.is_empty())
}

/// Wayland の環境で, アプリを XWayland (X11) で動かすかを判定します.
///
/// Wayland では, アプリが自分のウィンドウの位置を取得することも, 設定することもできません
/// (`outer_position` は常に 0,0 になり, `set_position` は無視されます). XWayland (X11) で動かすと,
/// 位置を扱えるので, 位置を記憶できます. ユーザーが `GDK_BACKEND` を指定している場合は, その指定を
/// 尊重します. XWayland が使えない (`DISPLAY` が無い) 場合は, 動かせないので, しません.
///
/// # Arguments
///
/// * `wayland_display` - 環境変数 `WAYLAND_DISPLAY` の値.
/// * `x_display` - 環境変数 `DISPLAY` の値.
/// * `gdk_backend` - 環境変数 `GDK_BACKEND` の値.
///
/// # Returns
///
/// `GDK_BACKEND=x11` を設定してよい場合は `true`.
pub fn should_use_x11(
    wayland_display: Option<&str>,
    x_display: Option<&str>,
    gdk_backend: Option<&str>,
) -> bool {
    is_set(wayland_display) && is_set(x_display) && !is_set(gdk_backend)
}

/// ウィンドウの位置を, 取得・設定できる環境かを判定します.
///
/// Wayland のまま (X11 を使わずに) 動いている場合は, 位置が常に 0,0 で, 意味を持たないため `false`.
///
/// # Arguments
///
/// * `wayland_display` - 環境変数 `WAYLAND_DISPLAY` の値.
/// * `gdk_backend` - 環境変数 `GDK_BACKEND` の値.
///
/// # Returns
///
/// 位置を扱える場合は `true`.
pub fn is_position_supported(wayland_display: Option<&str>, gdk_backend: Option<&str>) -> bool {
    !is_set(wayland_display) || gdk_backend.is_some_and(|b| b.starts_with("x11"))
}

/// 環境変数を読みます.
///
/// # Arguments
///
/// * `name` - 環境変数の名前.
///
/// # Returns
///
/// 値. 設定されていない場合や, UTF-8 でない場合は `None`.
fn env_var(name: &str) -> Option<String> {
    std::env::var(name).ok()
}

/// 環境変数から, ウィンドウの位置を取得・設定できる環境かを判定します.
///
/// # Arguments
///
/// * `env` - 環境変数を読む関数.
///
/// # Returns
///
/// 位置を扱える場合は `true`.
fn position_supported_by(env: &dyn Fn(&str) -> Option<String>) -> bool {
    is_position_supported(
        env("WAYLAND_DISPLAY").as_deref(),
        env("GDK_BACKEND").as_deref(),
    )
}

/// Wayland の環境で, アプリを XWayland (X11) で動かすよう, 環境変数を設定します.
///
/// # Arguments
///
/// * `env` - 環境変数を読む関数.
/// * `set_env` - 環境変数を設定する関数 (名前, 値).
#[cfg(target_os = "linux")]
fn prefer_x11_with(env: &dyn Fn(&str) -> Option<String>, set_env: &mut dyn FnMut(&str, &str)) {
    if should_use_x11(
        env("WAYLAND_DISPLAY").as_deref(),
        env("DISPLAY").as_deref(),
        env("GDK_BACKEND").as_deref(),
    ) {
        set_env("GDK_BACKEND", "x11");
    }
}

/// Linux の Wayland の環境では, アプリを XWayland (X11) で動かすよう, 環境変数を設定します.
///
/// GTK を初期化する前 (他のスレッドを作る前) に, 一度だけ呼びます.
// 実際のプロセスの環境変数を書き換えるため, カバレッジの対象外にする (処理は prefer_x11_with で検証する).
#[cfg(target_os = "linux")]
#[cfg(not(tarpaulin_include))]
pub fn prefer_x11() {
    prefer_x11_with(&env_var, &mut |name, value| std::env::set_var(name, value));
}

/// 画面 (モニター) の領域. 物理ピクセル.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Area {
    /// 左上の x 座標.
    pub x: i32,
    /// 左上の y 座標.
    pub y: i32,
    /// 幅.
    pub width: u32,
    /// 高さ.
    pub height: u32,
}

/// 保存されたウィンドウの状態から決めた, 復元の内容.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct RestorePlan {
    /// 設定する内側の大きさ (論理ピクセル). 保存値が不正な場合は `None` (既定の大きさのまま).
    pub size: Option<(u32, u32)>,
    /// 設定する左上の位置 (物理ピクセル). 保存値が無い・画面の外の場合は `None` (OS の既定の位置).
    pub position: Option<(i32, i32)>,
    /// 最大化する場合は `true`.
    pub maximized: bool,
}

/// ウィンドウの大きさが, 復元してよい範囲かを判定します.
///
/// # Arguments
///
/// * `width` - 内側の幅 (論理ピクセル).
/// * `height` - 内側の高さ (論理ピクセル).
///
/// # Returns
///
/// 最小値以上, 最大値以下の場合は `true`.
fn is_valid_size(width: u32, height: u32) -> bool {
    (MIN_SIZE.0..=MAX_SIZE.0).contains(&width) && (MIN_SIZE.1..=MAX_SIZE.1).contains(&height)
}

/// ウィンドウの左上の位置が, いずれかの画面の内側にあるかを判定します.
///
/// # Arguments
///
/// * `x` - 左上の x 座標 (物理ピクセル).
/// * `y` - 左上の y 座標 (物理ピクセル).
/// * `areas` - 接続されている画面の領域.
///
/// # Returns
///
/// 画面の端から `VISIBLE_MARGIN` より内側にある場合は `true`. 画面が 1 つも無い場合は `false`.
fn is_on_screen(x: i32, y: i32, areas: &[Area]) -> bool {
    areas.iter().any(|a| {
        let right = i64::from(a.x) + i64::from(a.width) - i64::from(VISIBLE_MARGIN);
        let bottom = i64::from(a.y) + i64::from(a.height) - i64::from(VISIBLE_MARGIN);
        i64::from(x) >= i64::from(a.x) - i64::from(VISIBLE_MARGIN)
            && i64::from(x) < right
            && i64::from(y) >= i64::from(a.y)
            && i64::from(y) < bottom
    })
}

/// 保存された状態から, 復元の内容を決めます.
///
/// 大きさが不正なら, 大きさも位置も設定しません (位置だけを設定すると, 不正な大きさと組み合わさるため).
/// 位置は, 保存されていて, いずれかの画面の内側にあるときだけ設定します.
///
/// # Arguments
///
/// * `state` - 保存されたウィンドウの状態.
/// * `areas` - 接続されている画面の領域.
///
/// # Returns
///
/// 復元の内容.
pub fn restore_plan(state: &WindowState, areas: &[Area]) -> RestorePlan {
    if !is_valid_size(state.width, state.height) {
        return RestorePlan {
            size: None,
            position: None,
            maximized: state.maximized,
        };
    }
    let position = match (state.x, state.y) {
        (Some(x), Some(y)) if is_on_screen(x, y, areas) => Some((x, y)),
        _ => None,
    };
    RestorePlan {
        size: Some((state.width, state.height)),
        position,
        maximized: state.maximized,
    }
}

/// 終了時のウィンドウの状態から, 保存する状態を決めます.
///
/// 最小化しているとき (Windows では, 位置が画面の外になり, 大きさも 0 になる) は, 以前の状態を残します.
/// 最大化しているときは, 最大化した大きさを「通常の大きさ」として保存しないよう, 以前の大きさと位置を
/// 残して, 最大化のフラグだけを立てます. 位置を扱えない環境 (`position` が `None`) では, 以前の位置を残します.
///
/// # Arguments
///
/// * `previous` - 保存されている状態. 無い場合は `None`.
/// * `size` - 今の内側の大きさ (論理ピクセル).
/// * `position` - 今の左上の位置 (物理ピクセル). 位置を扱えない環境では `None`.
/// * `maximized` - 最大化している場合は `true`.
/// * `minimized` - 最小化している場合は `true`.
///
/// # Returns
///
/// 保存する状態. 保存するものが無い場合 (最小化していて以前の状態も無い, 大きさが不正で以前の状態も無い)
/// は `None`.
pub fn capture(
    previous: Option<&WindowState>,
    size: (u32, u32),
    position: Option<(i32, i32)>,
    maximized: bool,
    minimized: bool,
) -> Option<WindowState> {
    if minimized {
        return previous.cloned();
    }
    if maximized {
        let base = previous.cloned().unwrap_or(WindowState {
            width: DEFAULT_SIZE.0,
            height: DEFAULT_SIZE.1,
            x: None,
            y: None,
            maximized: true,
        });
        return Some(WindowState {
            maximized: true,
            ..base
        });
    }
    if !is_valid_size(size.0, size.1) {
        return previous.cloned();
    }
    let (x, y) = match position {
        Some((x, y)) => (Some(x), Some(y)),
        None => (previous.and_then(|p| p.x), previous.and_then(|p| p.y)),
    };
    Some(WindowState {
        width: size.0,
        height: size.1,
        x,
        y,
        maximized: false,
    })
}

/// 保存と復元で使う, ウィンドウの操作. テストでは, 実際のウィンドウの代わりを渡す.
pub trait WindowOps {
    /// 画面の拡大率を返します.
    ///
    /// # Returns
    ///
    /// 拡大率 (物理ピクセル / 論理ピクセル). 取得に失敗した場合はエラー文字列を含む [`Err`].
    fn scale_factor(&self) -> Result<f64, String>;

    /// 内側の大きさを返します.
    ///
    /// # Returns
    ///
    /// (幅, 高さ) (物理ピクセル). 取得に失敗した場合はエラー文字列を含む [`Err`].
    fn inner_size(&self) -> Result<(u32, u32), String>;

    /// 外側の左上の位置を返します.
    ///
    /// # Returns
    ///
    /// (x, y) (物理ピクセル). 取得に失敗した場合はエラー文字列を含む [`Err`].
    fn outer_position(&self) -> Result<(i32, i32), String>;

    /// 最大化しているかを返します.
    ///
    /// # Returns
    ///
    /// 最大化している場合は `true`. 取得に失敗した場合はエラー文字列を含む [`Err`].
    fn is_maximized(&self) -> Result<bool, String>;

    /// 最小化しているかを返します.
    ///
    /// # Returns
    ///
    /// 最小化している場合は `true`. 取得に失敗した場合はエラー文字列を含む [`Err`].
    fn is_minimized(&self) -> Result<bool, String>;

    /// 接続されている画面の領域を返します.
    ///
    /// # Returns
    ///
    /// 画面の領域 (物理ピクセル). 取得できない場合は空.
    fn monitor_areas(&self) -> Vec<Area>;

    /// 内側の大きさを設定します.
    ///
    /// # Arguments
    ///
    /// * `width` - 幅 (論理ピクセル).
    /// * `height` - 高さ (論理ピクセル).
    ///
    /// # Returns
    ///
    /// 成功した場合は [`Ok`]. 失敗した場合はエラー文字列を含む [`Err`].
    fn set_size(&self, width: u32, height: u32) -> Result<(), String>;

    /// 外側の左上の位置を設定します.
    ///
    /// # Arguments
    ///
    /// * `x` - x 座標 (物理ピクセル).
    /// * `y` - y 座標 (物理ピクセル).
    ///
    /// # Returns
    ///
    /// 成功した場合は [`Ok`]. 失敗した場合はエラー文字列を含む [`Err`].
    fn set_position(&self, x: i32, y: i32) -> Result<(), String>;

    /// 最大化します.
    ///
    /// # Returns
    ///
    /// 成功した場合は [`Ok`]. 失敗した場合はエラー文字列を含む [`Err`].
    fn maximize(&self) -> Result<(), String>;
}

// Tauri の実際のウィンドウを呼ぶだけのもので, cargo test ではウィンドウを作れないため,
// カバレッジの対象外にする (保存と復元の処理は save_with / restore_with で検証する).
#[cfg(not(tarpaulin_include))]
impl WindowOps for WebviewWindow {
    fn scale_factor(&self) -> Result<f64, String> {
        WebviewWindow::scale_factor(self).map_err(|e| e.to_string())
    }

    fn inner_size(&self) -> Result<(u32, u32), String> {
        WebviewWindow::inner_size(self)
            .map(|s| (s.width, s.height))
            .map_err(|e| e.to_string())
    }

    fn outer_position(&self) -> Result<(i32, i32), String> {
        WebviewWindow::outer_position(self)
            .map(|p| (p.x, p.y))
            .map_err(|e| e.to_string())
    }

    fn is_maximized(&self) -> Result<bool, String> {
        WebviewWindow::is_maximized(self).map_err(|e| e.to_string())
    }

    fn is_minimized(&self) -> Result<bool, String> {
        WebviewWindow::is_minimized(self).map_err(|e| e.to_string())
    }

    fn monitor_areas(&self) -> Vec<Area> {
        self.available_monitors()
            .unwrap_or_default()
            .iter()
            .map(|m| Area {
                x: m.position().x,
                y: m.position().y,
                width: m.size().width,
                height: m.size().height,
            })
            .collect()
    }

    fn set_size(&self, width: u32, height: u32) -> Result<(), String> {
        WebviewWindow::set_size(self, tauri::LogicalSize::new(width, height))
            .map_err(|e| e.to_string())
    }

    fn set_position(&self, x: i32, y: i32) -> Result<(), String> {
        WebviewWindow::set_position(self, tauri::PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())
    }

    fn maximize(&self) -> Result<(), String> {
        WebviewWindow::maximize(self).map_err(|e| e.to_string())
    }
}

/// ウィンドウの今の状態から, 保存する状態を決めます.
///
/// # Arguments
///
/// * `window` - 保存するウィンドウ.
/// * `previous` - 保存されている状態. 無い場合は `None`.
/// * `position_supported` - 位置を扱える環境の場合は `true`.
///
/// # Returns
///
/// 保存する状態 (保存するものが無い場合は `None`). ウィンドウの状態の取得に失敗した場合は,
/// エラー文字列を含む [`Err`].
fn capture_window(
    window: &dyn WindowOps,
    previous: Option<&WindowState>,
    position_supported: bool,
) -> Result<Option<WindowState>, String> {
    let scale = window.scale_factor()?;
    let (width, height) = window.inner_size()?;
    let size = (
        (f64::from(width) / scale).round() as u32,
        (f64::from(height) / scale).round() as u32,
    );
    let position = window.outer_position()?;
    // Wayland のままでは, 位置は常に 0,0 で意味が無いので, 保存しない.
    let position = position_supported.then_some(position);
    Ok(capture(
        previous,
        size,
        position,
        window.is_maximized()?,
        window.is_minimized()?,
    ))
}

/// ウィンドウの今の状態を, 設定ディレクトリの設定ファイルに保存します.
///
/// 取得に失敗した項目があれば, 警告をログに出して, 何も保存しません.
///
/// # Arguments
///
/// * `window` - 保存するウィンドウ.
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
/// * `env` - 環境変数を読む関数.
fn save_with(
    window: &dyn WindowOps,
    config_dir: Option<&Path>,
    env: &dyn Fn(&str) -> Option<String>,
) {
    let previous = load_window_state_from(config_dir);
    match capture_window(window, previous.as_ref(), position_supported_by(env)) {
        Ok(Some(state)) => store_window_state_to(config_dir, &state),
        Ok(None) => log::info!("保存するウィンドウの状態がありません"),
        Err(e) => log::warn!("ウィンドウの状態の取得失敗: {}", e),
    }
}

/// 設定ディレクトリに保存されているウィンドウの状態を復元します.
///
/// 保存値が無い場合, 大きさが不正な場合, 位置が画面の外の場合, 位置を扱えない環境の場合は,
/// その項目を設定しません. 設定に失敗した項目は, 警告をログに出して, 残りの項目を続けます.
///
/// # Arguments
///
/// * `window` - 復元するウィンドウ.
/// * `config_dir` - OS の設定ディレクトリ. 取得できなかった場合は `None`.
/// * `env` - 環境変数を読む関数.
fn restore_with(
    window: &dyn WindowOps,
    config_dir: Option<&Path>,
    env: &dyn Fn(&str) -> Option<String>,
) {
    let Some(state) = load_window_state_from(config_dir) else {
        return;
    };
    let plan = restore_plan(&state, &window.monitor_areas());
    if let Some((width, height)) = plan.size {
        if let Err(e) = window.set_size(width, height) {
            log::warn!("ウィンドウの大きさの設定失敗: {}", e);
        }
    }
    if let (true, Some((x, y))) = (position_supported_by(env), plan.position) {
        if let Err(e) = window.set_position(x, y) {
            log::warn!("ウィンドウの位置の設定失敗: {}", e);
        }
    }
    if plan.maximized {
        if let Err(e) = window.maximize() {
            log::warn!("ウィンドウの最大化失敗: {}", e);
        }
    }
    log::info!("ウィンドウの状態を復元: {:?}", plan);
}

/// ウィンドウの今の状態を, ユーザーの設定ファイルに保存します.
///
/// # Arguments
///
/// * `window` - 保存するウィンドウ.
// 実際のユーザーの設定ディレクトリへ書くため, カバレッジの対象外にする (処理は save_with で検証する).
#[cfg(not(tarpaulin_include))]
pub fn save(window: &WebviewWindow) {
    save_with(window, dirs::config_dir().as_deref(), &env_var);
}

/// ユーザーの設定ファイルに保存されているウィンドウの状態を復元します (起動時に呼ぶ).
///
/// # Arguments
///
/// * `window` - 復元するウィンドウ.
// 実際のユーザーの設定ディレクトリを読むため, カバレッジの対象外にする (処理は restore_with で検証する).
#[cfg(not(tarpaulin_include))]
pub fn restore(window: &WebviewWindow) {
    restore_with(window, dirs::config_dir().as_deref(), &env_var);
}

/// ウィンドウのラベルから, 保存または復元するウィンドウを取り出します.
///
/// # Arguments
///
/// * `app` - アプリケーションのハンドル.
///
/// # Returns
///
/// メインのウィンドウ. 無い場合は `None`.
// Tauri のアプリケーションのハンドルが要るため, カバレッジの対象外にする.
#[cfg(not(tarpaulin_include))]
pub fn main_window<M: Manager<tauri::Wry>>(app: &M) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

#[cfg(test)]
#[path = "../tests/unit/window_state_test.rs"]
mod tests;
