//! フロントエンドから呼び出す IPC コマンドを提供するモジュール.
//!
//! 機能ごとに, ファイルシステムの情報取得 (`fs`), ファイルの作成・名前変更 (`ops`),
//! 外部アプリケーションで開く操作 (`open`), コピー・移動・削除 (`transfer`) のサブモジュールへ分けています.
//! 各コマンドは, 呼び出しやすいようにこのモジュールから再エクスポートします.

/// アプリケーション自体の操作 (終了) を行うコマンド.
pub mod app;
/// 設定ファイルを読み込むコマンド.
pub mod config;
/// ディレクトリ一覧・ホームディレクトリ・ドライブ・ディスク容量を取得するコマンド.
pub mod fs;
/// 関連付けられたアプリケーションまたはエディタで開くコマンド.
pub mod open;
/// ファイル・ディレクトリの作成・名前変更を行うコマンド.
pub mod ops;
/// ファイルのプレビューを取得するコマンド.
pub mod preview;
/// コピー・移動・削除を, 進捗の通知と中断に対応して実行するコマンド.
pub mod transfer;

pub use app::quit_app;
pub use config::load_keymap;
pub use fs::{
    complete_path, get_disk_space, get_home_dir, list_drives, read_directory, DiskSpace, FileEntry,
};
pub use open::{open_in_editor, open_item};
pub use ops::{create_directory, create_file, rename_item};
pub use preview::{read_preview, Preview, PreviewKind};
pub use transfer::{
    cancel_transfer, check_conflicts, find_conflicts, run_transfer, transfer, transfer_with,
    TransferKind, TransferProgress, TransferRequest, TransferState, TransferSummary,
};
