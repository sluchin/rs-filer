//! アプリケーション自体の操作 (終了) を行うコマンド.

/// ウィンドウの状態 (大きさ・位置) を保存して, アプリケーションを終了します.
///
/// # Arguments
///
/// * `app` - アプリケーションのハンドル.
#[cfg(not(tarpaulin_include))]
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    if let Some(window) = crate::window_state::main_window(&app) {
        crate::window_state::save(&window);
    }
    log::info!("アプリケーション終了");
    app.exit(0);
}
