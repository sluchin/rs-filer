//! ウィンドウの大きさ・位置・最大化の状態を, 終了時に保存して, 起動時に復元するモジュール.
//!
//! 保存先は, アプリ設定ファイル (`config.json`) の `window` です (`commands::config`).
//! 保存と復元の判断 (値が正しいか, 画面の内側か) は, Tauri に依存しない関数にして, `cargo test` で
//! 検証します. ウィンドウを実際に読み書きする部分 (`save` と `restore`) だけが, Tauri に依存します.

use crate::commands::config::{load_window_state, store_window_state, WindowState};
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

/// Linux の Wayland の環境では, アプリを XWayland (X11) で動かすよう, 環境変数を設定します.
///
/// GTK を初期化する前 (他のスレッドを作る前) に, 一度だけ呼びます.
// 実際の環境変数を読み書きするため, カバレッジの対象外にする (判断は should_use_x11 で検証する).
#[cfg(target_os = "linux")]
#[cfg(not(tarpaulin_include))]
pub fn prefer_x11() {
    let get = |name: &str| std::env::var(name).ok();
    if should_use_x11(
        get("WAYLAND_DISPLAY").as_deref(),
        get("DISPLAY").as_deref(),
        get("GDK_BACKEND").as_deref(),
    ) {
        std::env::set_var("GDK_BACKEND", "x11");
    }
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

/// ウィンドウの今の状態を, 設定ファイルに保存します.
///
/// 取得に失敗した項目があれば, 警告をログに出して, 何も保存しません.
///
/// # Arguments
///
/// * `window` - 保存するウィンドウ.
// ウィンドウと実際のユーザーの設定ディレクトリを使うため, カバレッジの対象外にする (判断は capture で検証する).
#[cfg(not(tarpaulin_include))]
pub fn save(window: &WebviewWindow) {
    let state = (|| -> Result<Option<WindowState>, tauri::Error> {
        let scale = window.scale_factor()?;
        let physical = window.inner_size()?;
        let size = (
            (f64::from(physical.width) / scale).round() as u32,
            (f64::from(physical.height) / scale).round() as u32,
        );
        let position = window.outer_position()?;
        // Wayland のままでは, 位置は常に 0,0 で意味が無いので, 保存しない.
        let position = is_position_supported(
            std::env::var("WAYLAND_DISPLAY").ok().as_deref(),
            std::env::var("GDK_BACKEND").ok().as_deref(),
        )
        .then_some((position.x, position.y));
        Ok(capture(
            load_window_state().as_ref(),
            size,
            position,
            window.is_maximized()?,
            window.is_minimized()?,
        ))
    })();
    match state {
        Ok(Some(state)) => store_window_state(&state),
        Ok(None) => log::info!("保存するウィンドウの状態がありません"),
        Err(e) => log::warn!("ウィンドウの状態の取得失敗: {}", e),
    }
}

/// 保存されているウィンドウの状態を復元します (起動時に呼ぶ).
///
/// 保存値が無い場合, 大きさが不正な場合, 位置が画面の外の場合は, その項目を設定しません.
///
/// # Arguments
///
/// * `window` - 復元するウィンドウ.
// ウィンドウと実際のユーザーの設定ディレクトリを使うため, カバレッジの対象外にする (判断は restore_plan で検証する).
#[cfg(not(tarpaulin_include))]
pub fn restore(window: &WebviewWindow) {
    let Some(state) = load_window_state() else {
        return;
    };
    let areas: Vec<Area> = window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| Area {
            x: m.position().x,
            y: m.position().y,
            width: m.size().width,
            height: m.size().height,
        })
        .collect();
    let plan = restore_plan(&state, &areas);
    if let Some((width, height)) = plan.size {
        if let Err(e) = window.set_size(tauri::LogicalSize::new(width, height)) {
            log::warn!("ウィンドウの大きさの設定失敗: {}", e);
        }
    }
    let position_supported = is_position_supported(
        std::env::var("WAYLAND_DISPLAY").ok().as_deref(),
        std::env::var("GDK_BACKEND").ok().as_deref(),
    );
    if let (true, Some((x, y))) = (position_supported, plan.position) {
        if let Err(e) = window.set_position(tauri::PhysicalPosition::new(x, y)) {
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

/// ウィンドウのラベルから, 保存または復元するウィンドウを取り出します.
///
/// # Arguments
///
/// * `app` - アプリケーションのハンドル.
///
/// # Returns
///
/// メインのウィンドウ. 無い場合は `None`.
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
}
