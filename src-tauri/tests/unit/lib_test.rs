//! `lib` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `lib` の子モジュール (`#[path]`) として組み込む.

use super::*;

/// フロントエンドの型 (`src/bindings.ts`) が, コマンドから作ったものと同じであることを確かめます.
/// 環境変数 `UPDATE_BINDINGS` があれば, 作り直して書き込みます (`npm run bindings:generate`).
#[test]
fn test_specta_builder_bindings_up_to_date() {
    let dir = tempfile::tempdir().unwrap();
    let out = dir.path().join("bindings.ts");
    specta_builder()
        .export(specta_typescript::Typescript::default(), &out)
        .unwrap();
    let generated = std::fs::read_to_string(&out).unwrap();
    let committed = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/bindings.ts");
    if std::env::var_os("UPDATE_BINDINGS").is_some() {
        std::fs::write(&committed, &generated).unwrap();
    }
    assert!(
        std::fs::read_to_string(&committed).unwrap() == generated,
        "src/bindings.ts が, コマンドと合っていない. `npm run bindings:generate` で作り直す."
    );
}

/// フロントエンドから呼ぶコマンドが, どれも権限の対象 (`build.rs`) で, 許可されている
/// (`capabilities/default.json`) ことを確かめます. 漏れていると, 実行時に呼び出しを拒否されます.
#[test]
fn test_capabilities_allow_every_command() {
    let dir = tempfile::tempdir().unwrap();
    let out = dir.path().join("bindings.ts");
    specta_builder()
        .export(specta_typescript::Typescript::default(), &out)
        .unwrap();
    let generated = std::fs::read_to_string(&out).unwrap();
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let build = std::fs::read_to_string(root.join("build.rs")).unwrap();
    let capabilities = std::fs::read_to_string(root.join("capabilities/default.json")).unwrap();

    // コマンドは `__TAURI_INVOKE<...>("read_directory", ...)` の形で書き出される.
    let commands: Vec<&str> = generated
        .split(">(\"")
        .skip(1)
        .map(|rest| &rest[..rest.find('"').unwrap()])
        .collect();
    assert!(!commands.is_empty());
    for command in commands {
        assert!(
            build.contains(&format!("\"{command}\",")),
            "build.rs の COMMANDS に {command} が無い"
        );
        let permission = format!("\"allow-{}\"", command.replace('_', "-"));
        assert!(
            capabilities.contains(&permission),
            "capabilities/default.json に {permission} が無い"
        );
    }
}
