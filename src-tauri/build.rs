//! ビルドスクリプト. Tauri のビルド (設定・権限・アイコンなど) を行います.

/// フロントエンドから呼べる, アプリ独自の IPC コマンド (`lib.rs` の `specta_builder` と同じもの).
///
/// ここに書いたコマンドには, 権限 `allow-<コマンド名 (`_` を `-` にしたもの)>` が作られます.
/// 呼べるのは, `capabilities/default.json` で許可したコマンドだけです (書き忘れると, 実行時に拒否される).
/// `lib_test.rs` の `test_capabilities_allow_every_command` で, 漏れが無いことを確かめます.
const COMMANDS: &[&str] = &[
    "read_directory",
    "dirs_have_entries",
    "get_item_info",
    "dir_stats",
    "get_home_dir",
    "create_directory",
    "create_file",
    "rename_item",
    "extract_archive",
    "quit_app",
    "load_keymap",
    "load_config",
    "save_config",
    "save_last_paths",
    "complete_path",
    "read_preview",
    "run_transfer",
    "cancel_transfer",
    "check_conflicts",
    "check_stale_overwrites",
    "check_nested_conflicts",
    "open_item",
    "open_in_editor",
    "open_terminal",
    "run_external_command",
    "list_drives",
    "get_disk_space",
    "log_frontend_message",
    "copy_files_to_clipboard",
    "read_clipboard_files",
    "copy_text_to_clipboard",
    "load_history",
    "save_history",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
