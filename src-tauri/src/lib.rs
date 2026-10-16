//! `rsfiler` バックエンドアプリケーションのコアライブラリ.
//!
//! Tauri アプリケーションの初期化, IPC ハンドラー (`commands` モジュール) の設定,
//! ログ出力 (`logging` モジュール) の初期化, およびイベントループの実行を管理します.

/// フロントエンドと通信する IPC コマンドを提供するモジュール.
pub mod commands;
/// 標準エラー出力とログファイルへのログ出力を設定するモジュール.
pub mod logging;
/// ウィンドウの大きさ・位置・最大化の状態を保存して復元するモジュール.
pub mod window_state;

/// Tauri アプリケーションをビルドして実行します.
///
/// 以下の処理を順に実行します:
/// 0. (Linux の Wayland のみ) XWayland (X11) で動かすための環境変数の設定
/// 1. ログ出力 (標準エラー出力とログファイル) の初期化
/// 2. デフォルトの Tauri ビルダーの初期化
/// 3. フロントエンドから呼び出し可能な IPC ハンドラーの登録 (`commands` モジュールの各コマンド)
/// 4. 起動時のウィンドウの状態の復元と, 終了時の保存 (`window_state` モジュール)
/// 5. コンテキストの生成とアプリケーションループのスタート
///
/// # Panics
///
/// Tauri アプリケーションの初期化で修復不能なエラーが発生した場合,
/// `"error while building tauri application"` メッセージとともにパニックします.
#[cfg(not(tarpaulin_include))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Wayland では, ウィンドウの位置を扱えない. 位置を記憶できるよう, XWayland (X11) で動かす.
    // GTK の初期化の前 (スレッドを作る前) に設定する.
    #[cfg(target_os = "linux")]
    window_state::prefer_x11();
    logging::init_logging();
    tauri::Builder::default()
        .manage(commands::TransferState::default())
        .manage(commands::StatsState::default())
        .setup(|app| {
            if let Some(window) = window_state::main_window(app) {
                window_state::restore(&window);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(window) = window_state::main_window(window) {
                    window_state::save(&window);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::fs::read_directory,
            commands::fs::dirs_have_entries,
            commands::info::get_item_info,
            commands::info::dir_stats,
            commands::fs::get_home_dir,
            commands::ops::create_directory,
            commands::ops::create_file,
            commands::ops::rename_item,
            commands::app::quit_app,
            commands::config::load_keymap,
            commands::config::load_config,
            commands::config::save_config,
            commands::config::save_last_paths,
            commands::fs::complete_path,
            commands::preview::read_preview,
            commands::transfer::run_transfer,
            commands::transfer::cancel_transfer,
            commands::transfer::check_conflicts,
            commands::transfer::check_stale_overwrites,
            commands::transfer::check_nested_conflicts,
            commands::open::open_item,
            commands::open::open_in_editor,
            commands::open::open_terminal,
            commands::exec::run_external_command,
            commands::fs::list_drives,
            commands::fs::get_disk_space,
            commands::frontend_log::log_frontend_message,
            commands::clipboard::copy_files_to_clipboard,
            commands::clipboard::read_clipboard_files
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS の Cmd+Q のように, ウィンドウを閉じる操作を経ずに終了する場合も保存する.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(window) = window_state::main_window(app) {
                    window_state::save(&window);
                }
            }
        });
}
