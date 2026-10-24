//! `window_state` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `window_state` の子モジュール (`#[path]`) として組み込む.

use super::*;

fn screen() -> Vec<Area> {
    vec![Area {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
    }]
}

fn state(width: u32, height: u32, x: Option<i32>, y: Option<i32>, maximized: bool) -> WindowState {
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
