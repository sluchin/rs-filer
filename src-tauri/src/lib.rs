//! `rsfiler` バックエンドアプリケーションのコアライブラリ。
//!
//! Tauri アプリケーションの初期化、IPC ハンドラー（`commands` モジュール）の設定、
//! およびイベントループの実行を管理します。

mod commands;

/// Tauri アプリケーションをビルドして実行します。
///
/// 以下の処理を順に実行します:
/// 1. デフォルトの Tauri ビルダーの初期化
/// 2. フロントエンドから呼び出し可能な IPC ハンドラーの登録 (`read_directory`, `get_home_dir`)
/// 3. コンテキストの生成とアプリケーションループのスタート
///
/// # Panics
///
/// Tauri アプリケーションの初期化または実行ループ内で修復不能なエラーが発生した場合、
/// `"error while running tauri application"` メッセージとともにパニックします。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::read_directory,
            commands::get_home_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
