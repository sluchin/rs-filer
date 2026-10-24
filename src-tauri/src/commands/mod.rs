//! フロントエンドから呼び出す IPC コマンドを提供するモジュール.
//!
//! 機能ごとに, ファイルシステムの情報取得 (`fs`), ファイルの作成・名前変更 (`ops`),
//! ファイルの詳細 (`info`), 外部アプリケーションで開く操作 (`open`), コピー・移動・削除 (`transfer`), 外部コマンド実行 (`exec`),
//! ファイルのプレビュー (`preview`), 設定ファイルの読み書き (`config`), アプリ自体の操作 (`app`),
//! ファイルクリップボード操作 (`clipboard`), フロントエンドのログの転送 (`frontend_log`),
//! ディレクトリの移動履歴の保存 (`history`) の
//! サブモジュールへ分けています. 各コマンドは, 呼び出しやすいようにこのモジュールから再エクスポートします.
//!
//! ディスクや外部プロセスを使うコマンドは, `#[tauri::command(async)]` (同期の関数) か `async fn` にして,
//! メインスレッドの外 (非同期のランタイム) で実行します. 遅いディスクやネットワークドライブで待っても,
//! 画面が固まらないようにするためです. 順序を保つ必要があるもの (ログの転送) と, すぐ終わるもの
//! (終了・中断の要求・クリップボード・ホームディレクトリ) だけを, メインスレッドで実行します.

/// アプリケーション自体の操作 (終了) を行うコマンド.
pub mod app;
/// ファイルリストのクリップボード操作 (コピー・読み取り).
pub mod clipboard;
/// 設定ファイルの読み込み・書き込みを行うコマンド.
pub mod config;
/// 選択したファイルに対する外部コマンドの実行.
pub mod exec;
/// フロントエンドから転送されたログメッセージを記録するコマンド.
pub mod frontend_log;
/// ディレクトリ一覧・ホームディレクトリ・ドライブ・ディスク容量を取得するコマンド.
pub mod fs;
/// ディレクトリの移動履歴 (ペインごと) の保存と, 起動時の読み込みを行うコマンド.
pub mod history;
/// ファイル・ディレクトリの詳細 (サイズ・日時・権限・配下の合計など) を取得するコマンド.
pub mod info;
/// 関連付けられたアプリケーションまたはエディタで開く, およびターミナルを開くコマンド.
pub mod open;
/// ファイル・ディレクトリの作成・名前変更を行うコマンド.
pub mod ops;
/// ファイルのプレビューを取得するコマンド.
pub mod preview;
/// コピー・移動・削除を, 進捗の通知と中断に対応して実行するコマンド.
pub mod transfer;

pub use app::quit_app;
pub use clipboard::check_text;
#[cfg(not(tarpaulin_include))]
pub use clipboard::{copy_files_to_clipboard, copy_text_to_clipboard, read_clipboard_files};
pub use config::{
    load_config, load_keymap, save_config, save_last_paths, AppConfig, FontSize, LastPaths, Theme,
};
pub use exec::run_external_command;
pub use frontend_log::{log_frontend_message, FrontendLogEntry, LogLevel};
pub use fs::{
    complete_path, dirs_have_entries, get_disk_space, get_home_dir, list_drives, read_directory,
    DiskSpace, FileEntry,
};
pub use history::{
    history_path, load_history_from, retain_existing, save_history_to, PaneHistory,
    DEFAULT_HISTORY_LIMIT,
};
#[cfg(not(tarpaulin_include))]
pub use history::{load_history, save_history};
pub use info::{
    compute_dir_stats, dir_stats, get_item_info, mode_string, read_item_info, DirStats, ItemInfo,
    ItemKind, StatsState,
};
pub use open::{open_in_editor, open_item, open_terminal};
pub use ops::{create_directory, create_file, rename_item};
pub use preview::{read_preview, Preview, PreviewKind};
pub use transfer::{
    cancel_transfer, check_conflicts, check_nested_conflicts, check_stale_overwrites,
    find_conflicts, find_nested_conflicts, find_stale_overwrites, run_transfer, transfer,
    transfer_with, NestedConflict, TransferKind, TransferProgress, TransferRequest, TransferState,
    TransferSummary,
};
