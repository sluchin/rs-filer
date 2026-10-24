//! `commands::preview` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `commands::preview` の子モジュール (`#[path]`) として組み込む.

use super::*;
use tempfile::tempdir;

#[test]
fn test_build_preview_utf8_text() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("a.txt");
    fs::write(&file, "こんにちは\nworld").unwrap();

    let preview = build_preview(&file).unwrap();

    assert_eq!(preview.kind, PreviewKind::Text);
    assert_eq!(preview.encoding.as_deref(), Some("UTF-8"));
    assert_eq!(preview.text.as_deref(), Some("こんにちは\nworld"));
    assert!(!preview.truncated);
    assert_eq!(preview.size, fs::metadata(&file).unwrap().len());
}

#[test]
fn test_build_preview_truncated_utf8_cuts_at_char_boundary() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("big.txt");
    fs::write(&file, "あ".repeat(100_000)).unwrap();

    let preview = build_preview(&file).unwrap();

    assert!(preview.truncated);
    assert_eq!(preview.encoding.as_deref(), Some("UTF-8"));
    assert!(!preview.text.unwrap().contains('\u{fffd}'));
}

#[test]
fn test_build_preview_shift_jis_text() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("sjis.txt");
    let source = "日本語のテキストファイルです。文字コードの自動判別を確認します。\n".repeat(5);
    let (bytes, _, _) = encoding_rs::SHIFT_JIS.encode(&source);
    fs::write(&file, &bytes).unwrap();

    let preview = build_preview(&file).unwrap();

    assert_eq!(preview.encoding.as_deref(), Some("Shift_JIS"));
    assert_eq!(preview.text.as_deref(), Some(source.as_str()));
}

#[test]
fn test_build_preview_utf16_bom_text() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("u16.txt");
    let mut bytes = vec![0xff, 0xfe];
    for unit in "hi".encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    fs::write(&file, bytes).unwrap();

    let preview = build_preview(&file).unwrap();

    assert_eq!(preview.kind, PreviewKind::Text);
    assert_eq!(preview.encoding.as_deref(), Some("UTF-16LE"));
    assert_eq!(preview.text.as_deref(), Some("hi"));
}

#[test]
fn test_build_preview_binary_hex_dump() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("a.bin");
    let mut bytes = b"AB\x00\x01".to_vec();
    bytes.extend(vec![0xffu8; 2000]);
    fs::write(&file, &bytes).unwrap();

    let preview = build_preview(&file).unwrap();

    assert_eq!(preview.kind, PreviewKind::Binary);
    assert!(preview.truncated);
    let text = preview.text.unwrap();
    assert!(text.starts_with("00000000  41 42 00 01 ff"));
    assert!(text.lines().next().unwrap().ends_with("|AB..............|"));
    assert_eq!(text.lines().count(), HEX_DUMP_BYTES / 16);
}

#[test]
fn test_build_preview_image_data_url() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("a.PNG");
    fs::write(&file, [1u8, 2, 3]).unwrap();

    let preview = build_preview(&file).unwrap();

    assert_eq!(preview.kind, PreviewKind::Image);
    assert_eq!(
        preview.data_url.as_deref(),
        Some("data:image/png;base64,AQID")
    );
    assert!(preview.text.is_none());
}

#[test]
fn test_image_mime_success() {
    for (name, mime) in [
        ("a.jpg", "image/jpeg"),
        ("a.jpeg", "image/jpeg"),
        ("a.gif", "image/gif"),
        ("a.webp", "image/webp"),
        ("a.bmp", "image/bmp"),
        ("a.ico", "image/x-icon"),
        ("a.svg", "image/svg+xml"),
    ] {
        assert_eq!(image_mime(Path::new(name)), Some(mime), "{}", name);
    }
    assert_eq!(image_mime(Path::new("a.txt")), None);
    assert_eq!(image_mime(Path::new("noext")), None);
}

#[test]
fn test_build_preview_large_image_failure() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("huge.png");
    fs::File::create(&file)
        .unwrap()
        .set_len(MAX_IMAGE_BYTES + 1)
        .unwrap();
    assert!(build_preview(&file).unwrap_err().contains("too large"));
}

#[test]
fn test_build_preview_directory_and_missing_failure() {
    let dir = tempdir().unwrap();
    assert!(build_preview(dir.path())
        .unwrap_err()
        .contains("Directories"));
    let missing = dir.path().join("none");
    assert!(build_preview(&missing)
        .unwrap_err()
        .starts_with("Path does not exist"));
    assert!(read_preview(missing.to_string_lossy().into_owned()).is_err());
}

#[test]
fn test_build_preview_empty_file() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("empty");
    fs::write(&file, "").unwrap();
    let preview = build_preview(&file).unwrap();
    assert_eq!(preview.kind, PreviewKind::Text);
    assert_eq!(preview.text.as_deref(), Some(""));
}
