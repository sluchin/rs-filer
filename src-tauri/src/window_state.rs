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
    /// 画面の拡大率 (物理ピクセル / 論理ピクセル) を返します.
    fn scale_factor(&self) -> Result<f64, String>;

    /// 内側の大きさ (物理ピクセル) を返します.
    fn inner_size(&self) -> Result<(u32, u32), String>;

    /// 外側の左上の位置 (物理ピクセル) を返します.
    fn outer_position(&self) -> Result<(i32, i32), String>;

    /// 最大化しているかを返します.
    fn is_maximized(&self) -> Result<bool, String>;

    /// 最小化しているかを返します.
    fn is_minimized(&self) -> Result<bool, String>;

    /// 接続されている画面の領域を返します. 取得できない場合は空.
    fn monitor_areas(&self) -> Vec<Area>;

    /// 内側の大きさ (論理ピクセル) を設定します.
    fn set_size(&self, width: u32, height: u32) -> Result<(), String>;

    /// 外側の左上の位置 (物理ピクセル) を設定します.
    fn set_position(&self, x: i32, y: i32) -> Result<(), String>;

    /// 最大化します.
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
mod tests {
    use super::*;

    fn screen() -> Vec<Area> {
        vec![Area {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        }]
    }

    fn state(
        width: u32,
        height: u32,
        x: Option<i32>,
        y: Option<i32>,
        maximized: bool,
    ) -> WindowState {
        WindowState {
            width,
            height,
            x,
            y,
            maximized,
        }
    }

    #[test]
    fn test_is_valid_size_boundaries() {
        assert!(is_valid_size(400, 300));
        assert!(is_valid_size(16384, 16384));
        assert!(!is_valid_size(399, 300));
        assert!(!is_valid_size(400, 299));
        assert!(!is_valid_size(16385, 600));
        assert!(!is_valid_size(800, 16385));
        assert!(!is_valid_size(0, 0));
    }

    #[test]
    fn test_is_on_screen_inside_and_edges() {
        let areas = screen();
        assert!(is_on_screen(100, 100, &areas));
        // 左へ少しはみ出していても, タイトルバーを掴める範囲なら画面の中.
        assert!(is_on_screen(-50, 0, &areas));
        assert!(!is_on_screen(-51, 0, &areas));
        // 右端・下端ぎりぎりは, 画面の外とみなす.
        assert!(is_on_screen(1919 - 50, 1079 - 50, &areas));
        assert!(!is_on_screen(1920 - 50, 100, &areas));
        assert!(!is_on_screen(100, 1080 - 50, &areas));
        // 上へはみ出したタイトルバーは掴めないので, 画面の外.
        assert!(!is_on_screen(100, -1, &areas));
    }

    #[test]
    fn test_is_on_screen_multiple_monitors_and_none() {
        let areas = vec![
            Area {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
            },
            Area {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
        ];
        assert!(is_on_screen(-1000, 200, &areas));
        assert!(is_on_screen(1000, 200, &areas));
        assert!(!is_on_screen(5000, 200, &areas));
        assert!(!is_on_screen(0, 0, &[]));
    }

    #[test]
    fn test_restore_plan_valid_state() {
        let plan = restore_plan(&state(1000, 700, Some(120), Some(80), false), &screen());
        assert_eq!(
            plan,
            RestorePlan {
                size: Some((1000, 700)),
                position: Some((120, 80)),
                maximized: false,
            }
        );
    }

    #[test]
    fn test_restore_plan_invalid_size_uses_default() {
        let plan = restore_plan(&state(10, 10, Some(120), Some(80), false), &screen());
        assert_eq!(
            plan,
            RestorePlan {
                size: None,
                position: None,
                maximized: false,
            }
        );
    }

    #[test]
    fn test_restore_plan_off_screen_position_keeps_size_only() {
        let plan = restore_plan(&state(1000, 700, Some(9000), Some(80), false), &screen());
        assert_eq!(plan.size, Some((1000, 700)));
        assert_eq!(plan.position, None);
    }

    #[test]
    fn test_restore_plan_missing_position_and_maximized() {
        let plan = restore_plan(&state(1000, 700, None, None, true), &screen());
        assert_eq!(plan.size, Some((1000, 700)));
        assert_eq!(plan.position, None);
        assert!(plan.maximized);
        // x だけ・y だけの保存値は, 位置として使わない.
        let plan = restore_plan(&state(1000, 700, Some(10), None, false), &screen());
        assert_eq!(plan.position, None);
    }

    #[test]
    fn test_restore_plan_invalid_size_keeps_maximized() {
        let plan = restore_plan(&state(0, 0, None, None, true), &screen());
        assert_eq!(plan.size, None);
        assert!(plan.maximized);
    }

    #[test]
    fn test_capture_normal_window() {
        let captured = capture(None, (1000, 700), Some((120, 80)), false, false);
        assert_eq!(captured, Some(state(1000, 700, Some(120), Some(80), false)));
    }

    #[test]
    fn test_capture_maximized_keeps_previous_size() {
        let previous = state(1000, 700, Some(120), Some(80), false);
        let captured = capture(Some(&previous), (1920, 1080), Some((0, 0)), true, false);
        assert_eq!(captured, Some(state(1000, 700, Some(120), Some(80), true)));
    }

    #[test]
    fn test_capture_maximized_without_previous_uses_default_size() {
        let captured = capture(None, (1920, 1080), Some((0, 0)), true, false);
        assert_eq!(captured, Some(state(800, 600, None, None, true)));
    }

    #[test]
    fn test_capture_minimized_keeps_previous() {
        let previous = state(1000, 700, Some(120), Some(80), false);
        assert_eq!(
            capture(Some(&previous), (0, 0), Some((-32000, -32000)), false, true),
            Some(previous)
        );
        assert_eq!(
            capture(None, (0, 0), Some((-32000, -32000)), false, true),
            None
        );
    }

    #[test]
    fn test_capture_invalid_size_keeps_previous() {
        let previous = state(1000, 700, Some(120), Some(80), false);
        assert_eq!(
            capture(Some(&previous), (10, 10), Some((0, 0)), false, false),
            Some(previous)
        );
        assert_eq!(capture(None, (10, 10), Some((0, 0)), false, false), None);
    }

    #[test]
    fn test_capture_restored_from_maximized_overwrites_flag() {
        // 最大化を解除して終了したら, 最大化のフラグを落として, 今の大きさを保存する.
        let previous = state(1000, 700, Some(120), Some(80), true);
        let captured = capture(Some(&previous), (900, 650), Some((50, 40)), false, false);
        assert_eq!(captured, Some(state(900, 650, Some(50), Some(40), false)));
    }

    #[test]
    fn test_capture_without_position_keeps_previous_position() {
        // 位置を扱えない環境 (Wayland のまま) では, 大きさだけを更新して, 以前の位置を残す.
        let previous = state(1000, 700, Some(120), Some(80), false);
        assert_eq!(
            capture(Some(&previous), (900, 650), None, false, false),
            Some(state(900, 650, Some(120), Some(80), false))
        );
        assert_eq!(
            capture(None, (900, 650), None, false, false),
            Some(state(900, 650, None, None, false))
        );
    }

    #[test]
    fn test_should_use_x11_conditions() {
        // Wayland で, XWayland が使えて, GDK_BACKEND の指定が無いときだけ.
        assert!(should_use_x11(Some("wayland-0"), Some(":0"), None));
        assert!(should_use_x11(Some("wayland-0"), Some(":0"), Some("")));
        // ユーザーが GDK_BACKEND を指定している場合は, 尊重する.
        assert!(!should_use_x11(
            Some("wayland-0"),
            Some(":0"),
            Some("wayland")
        ));
        assert!(!should_use_x11(Some("wayland-0"), Some(":0"), Some("x11")));
        // XWayland が使えない場合・Wayland でない場合は, しない.
        assert!(!should_use_x11(Some("wayland-0"), None, None));
        assert!(!should_use_x11(Some("wayland-0"), Some(""), None));
        assert!(!should_use_x11(None, Some(":0"), None));
        assert!(!should_use_x11(Some(""), Some(":0"), None));
    }

    #[test]
    fn test_is_position_supported_conditions() {
        // Wayland でない (X11, Windows, macOS) なら, 扱える.
        assert!(is_position_supported(None, None));
        assert!(is_position_supported(Some(""), None));
        // Wayland でも, X11 (XWayland) で動いていれば, 扱える.
        assert!(is_position_supported(Some("wayland-0"), Some("x11")));
        assert!(is_position_supported(
            Some("wayland-0"),
            Some("x11,wayland")
        ));
        // Wayland のまま動いていれば, 扱えない.
        assert!(!is_position_supported(Some("wayland-0"), None));
        assert!(!is_position_supported(Some("wayland-0"), Some("wayland")));
    }

    #[test]
    fn test_env_var_success() {
        assert!(env_var("PATH").is_some());
        assert_eq!(env_var("RSFILER_NO_SUCH_VARIABLE"), None);
    }

    /// 環境変数の代わり. `vars` にある名前だけを返す.
    fn fake_env(vars: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
        move |name| {
            vars.iter()
                .find(|(n, _)| *n == name)
                .map(|(_, v)| v.to_string())
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_prefer_x11_with_conditions() {
        let mut set = Vec::new();
        prefer_x11_with(
            &fake_env(&[("WAYLAND_DISPLAY", "wayland-0"), ("DISPLAY", ":0")]),
            &mut |name, value| set.push((name.to_string(), value.to_string())),
        );
        assert_eq!(set, vec![("GDK_BACKEND".to_string(), "x11".to_string())]);

        // 利用者が GDK_BACKEND を指定していれば, 変えない.
        prefer_x11_with(
            &fake_env(&[
                ("WAYLAND_DISPLAY", "wayland-0"),
                ("DISPLAY", ":0"),
                ("GDK_BACKEND", "wayland"),
            ]),
            &mut |_, _| panic!("呼ばれないこと"),
        );
    }

    /// テスト用のウィンドウ. `fail` が `true` の場合は, すべての操作に失敗する.
    struct MockWindow {
        scale: f64,
        size: (u32, u32),
        position: (i32, i32),
        maximized: bool,
        areas: Vec<Area>,
        fail: bool,
        calls: std::cell::RefCell<Vec<String>>,
    }

    impl MockWindow {
        fn new() -> Self {
            Self {
                scale: 2.0,
                size: (2400, 1600),
                position: (100, 200),
                maximized: false,
                areas: screen(),
                fail: false,
                calls: std::cell::RefCell::new(Vec::new()),
            }
        }

        fn result<T>(&self, value: T) -> Result<T, String> {
            if self.fail {
                Err("window error".to_string())
            } else {
                Ok(value)
            }
        }

        fn record(&self, call: String) -> Result<(), String> {
            self.calls.borrow_mut().push(call);
            self.result(())
        }
    }

    impl WindowOps for MockWindow {
        fn scale_factor(&self) -> Result<f64, String> {
            self.result(self.scale)
        }

        fn inner_size(&self) -> Result<(u32, u32), String> {
            self.result(self.size)
        }

        fn outer_position(&self) -> Result<(i32, i32), String> {
            self.result(self.position)
        }

        fn is_maximized(&self) -> Result<bool, String> {
            self.result(self.maximized)
        }

        fn is_minimized(&self) -> Result<bool, String> {
            self.result(false)
        }

        fn monitor_areas(&self) -> Vec<Area> {
            self.areas.clone()
        }

        fn set_size(&self, width: u32, height: u32) -> Result<(), String> {
            self.record(format!("size {width}x{height}"))
        }

        fn set_position(&self, x: i32, y: i32) -> Result<(), String> {
            self.record(format!("position {x},{y}"))
        }

        fn maximize(&self) -> Result<(), String> {
            self.record("maximize".to_string())
        }
    }

    const X11: &[(&str, &str)] = &[("DISPLAY", ":0")];
    const WAYLAND: &[(&str, &str)] = &[("WAYLAND_DISPLAY", "wayland-0")];

    #[test]
    fn test_save_with_success() {
        let dir = tempfile::tempdir().unwrap();
        save_with(&MockWindow::new(), Some(dir.path()), &fake_env(X11));
        // 物理ピクセルを拡大率で割って, 論理ピクセルで保存する.
        assert_eq!(
            load_window_state_from(Some(dir.path())),
            Some(state(1200, 800, Some(100), Some(200), false))
        );
    }

    #[test]
    fn test_save_with_wayland_keeps_previous_position() {
        let dir = tempfile::tempdir().unwrap();
        store_window_state_to(
            Some(dir.path()),
            &state(800, 600, Some(10), Some(20), false),
        );
        save_with(&MockWindow::new(), Some(dir.path()), &fake_env(WAYLAND));
        assert_eq!(
            load_window_state_from(Some(dir.path())),
            Some(state(1200, 800, Some(10), Some(20), false))
        );
    }

    #[test]
    fn test_save_with_nothing_to_save_and_failure() {
        let dir = tempfile::tempdir().unwrap();
        // 大きさが不正で, 以前の状態も無い場合は, 保存しない.
        let tiny = MockWindow {
            size: (10, 10),
            ..MockWindow::new()
        };
        save_with(&tiny, Some(dir.path()), &fake_env(X11));
        assert_eq!(load_window_state_from(Some(dir.path())), None);

        // ウィンドウの状態を取得できない場合も, 保存しない.
        let failing = MockWindow {
            fail: true,
            ..MockWindow::new()
        };
        save_with(&failing, Some(dir.path()), &fake_env(X11));
        assert_eq!(load_window_state_from(Some(dir.path())), None);
    }

    #[test]
    fn test_restore_with_success() {
        let dir = tempfile::tempdir().unwrap();
        store_window_state_to(
            Some(dir.path()),
            &state(1000, 700, Some(30), Some(40), true),
        );
        let window = MockWindow::new();
        restore_with(&window, Some(dir.path()), &fake_env(X11));
        assert_eq!(
            *window.calls.borrow(),
            vec!["size 1000x700", "position 30,40", "maximize"]
        );
    }

    #[test]
    fn test_restore_with_skips_unavailable_items() {
        // 保存値が無ければ, 何もしない.
        let dir = tempfile::tempdir().unwrap();
        let window = MockWindow::new();
        restore_with(&window, Some(dir.path()), &fake_env(X11));
        assert!(window.calls.borrow().is_empty());

        // Wayland のままなら, 位置は設定しない. 最大化していなければ, 最大化しない.
        store_window_state_to(
            Some(dir.path()),
            &state(1000, 700, Some(30), Some(40), false),
        );
        restore_with(&window, Some(dir.path()), &fake_env(WAYLAND));
        assert_eq!(*window.calls.borrow(), vec!["size 1000x700"]);
    }

    #[test]
    fn test_restore_with_failure_continues() {
        let dir = tempfile::tempdir().unwrap();
        store_window_state_to(
            Some(dir.path()),
            &state(1000, 700, Some(30), Some(40), true),
        );
        let window = MockWindow {
            fail: true,
            ..MockWindow::new()
        };
        restore_with(&window, Some(dir.path()), &fake_env(X11));
        // 失敗しても, 残りの項目を続ける.
        assert_eq!(
            *window.calls.borrow(),
            vec!["size 1000x700", "position 30,40", "maximize"]
        );
    }
}
