//! `rsfiler` バックエンドアプリケーションのコアライブラリ.
//!
//! Tauri アプリケーションの初期化, IPC ハンドラー (`commands` モジュール) の設定,
//! ログ出力 (`logging` モジュール) の初期化, およびイベントループの実行を管理します.

/// フロントエンドと通信する IPC コマンドを提供するモジュール.
pub mod commands;
/// 標準エラー出力とログファイルへのログ出力を設定するモジュール.
pub mod logging;

/// Tauri アプリケーションをビルドして実行します.
///
/// 以下の処理を順に実行します:
/// 1. ログ出力 (標準エラー出力とログファイル) の初期化
/// 2. デフォルトの Tauri ビルダーの初期化
/// 3. フロントエンドから呼び出し可能な IPC ハンドラーの登録 (`commands` モジュールの各コマンド)
/// 4. コンテキストの生成とアプリケーションループのスタート
///
/// # Panics
///
/// Tauri アプリケーションの初期化または実行ループ内で修復不能なエラーが発生した場合,
/// `"error while running tauri application"` メッセージとともにパニックします.
#[cfg(not(tarpaulin_include))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init_logging();
    tauri::Builder::default()
        .manage(commands::TransferState::default())
        .invoke_handler(tauri::generate_handler![
            commands::fs::read_directory,
            commands::fs::get_home_dir,
            commands::ops::create_directory,
            commands::ops::create_file,
            commands::ops::rename_item,
            commands::app::quit_app,
            commands::config::load_keymap,
            commands::config::load_config,
            commands::config::save_config,
            commands::fs::complete_path,
            commands::preview::read_preview,
            commands::transfer::run_transfer,
            commands::transfer::cancel_transfer,
            commands::transfer::check_conflicts,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
