//! フロントエンドから呼び出す IPC コマンドを提供するモジュール.
//!
//! 機能ごとに, ファイルシステムの情報取得 (`fs`), ファイルの作成・名前変更 (`ops`),
//! ファイルの詳細 (`info`), 外部アプリケーションで開く操作 (`open`), コピー・移動・削除 (`transfer`), 外部コマンド実行 (`exec`),
//! ファイルのプレビュー (`preview`), 設定ファイルの読み書き (`config`), アプリ自体の操作 (`app`),
//! ファイルクリップボード操作 (`clipboard`), フロントエンドのログの転送 (`frontend_log`) の
//! サブモジュールへ分けています. 各コマンドは, 呼び出しやすいようにこのモジュールから再エクスポートします.

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
#[cfg(not(tarpaulin_include))]
pub use clipboard::{copy_files_to_clipboard, read_clipboard_files};
pub use config::{load_config, load_keymap, save_config, AppConfig, FontSize, Theme};
pub use exec::run_external_command;
pub use frontend_log::{log_frontend_message, LogLevel};
pub use fs::{
    complete_path, dirs_have_entries, get_disk_space, get_home_dir, list_drives, read_directory,
    DiskSpace, FileEntry,
};
pub use info::{
    compute_dir_stats, dir_stats, get_item_info, mode_string, read_item_info, DirStats, ItemInfo,
    ItemKind, StatsState,
};
pub use open::{open_in_editor, open_item, open_terminal};
pub use ops::{create_directory, create_file, rename_item};
pub use preview::{read_preview, Preview, PreviewKind};
pub use transfer::{
    cancel_transfer, check_conflicts, check_nested_conflicts, find_conflicts,
    find_nested_conflicts, run_transfer, transfer, transfer_with, NestedConflict, TransferKind,
    TransferProgress, TransferRequest, TransferState, TransferSummary,
};
