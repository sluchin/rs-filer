//! フロントエンドから呼び出す IPC コマンドを提供するモジュール.
//!
//! 機能ごとに, ファイルシステムの情報取得 (`fs`), ファイル操作 (`ops`),
//! 外部アプリケーションで開く操作 (`open`) のサブモジュールへ分けています.
//! 各コマンドは, 呼び出しやすいようにこのモジュールから再エクスポートします.

/// ディレクトリ一覧・ホームディレクトリ・ドライブ・ディスク容量を取得するコマンド.
pub mod fs;
/// 関連付けられたアプリケーションまたはエディタで開くコマンド.
pub mod open;
/// ファイル・ディレクトリのコピー・作成・名前変更・削除を行うコマンド.
pub mod ops;

pub use fs::{get_disk_space, get_home_dir, list_drives, read_directory, DiskSpace, FileEntry};
pub use open::{open_in_editor, open_item};
pub use ops::{copy_item, create_directory, create_file, delete_item, rename_item};
