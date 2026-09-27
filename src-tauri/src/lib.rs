//! `rsfiler` バックエンドアプリケーションのコアライブラリ.
//!
//! Tauri アプリケーションの初期化, IPC ハンドラー (`commands` モジュール) の設定,
//! およびイベントループの実行を管理します.

/// フロントエンドと通信する IPC コマンドを提供するモジュール.
pub mod commands;

/// 単一ファイルまたはディレクトリをコピーするコマンド.
pub use commands::copy_item;

/// Tauri アプリケーションをビルドして実行します.
///
/// 以下の処理を順に実行します:
/// 1. デフォルトの Tauri ビルダーの初期化
/// 2. フロントエンドから呼び出し可能な IPC ハンドラーの登録 (`commands` モジュールの各コマンド)
/// 3. コンテキストの生成とアプリケーションループのスタート
///
/// # Panics
///
/// Tauri アプリケーションの初期化または実行ループ内で修復不能なエラーが発生した場合,
/// `"error while running tauri application"` メッセージとともにパニックします.
#[cfg(not(tarpaulin_include))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::fs::read_directory,
            commands::fs::get_home_dir,
            commands::ops::copy_item,
            commands::ops::create_directory,
            commands::ops::create_file,
            commands::ops::rename_item,
            commands::ops::delete_item,
            commands::open::open_item,
            commands::open::open_in_editor,
            commands::fs::list_drives,
            commands::fs::get_disk_space
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
