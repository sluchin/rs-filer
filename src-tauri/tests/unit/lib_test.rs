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
