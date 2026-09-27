//! アプリケーション自体の操作 (終了) を行うコマンド.

/// アプリケーションを終了します.
///
/// # Arguments
///
/// * `app` - アプリケーションのハンドル.
#[cfg(not(tarpaulin_include))]
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    log::info!("アプリケーション終了");
    app.exit(0);
}
