//! ファイルのプレビュー (テキスト・画像・バイナリ) を取得するコマンド.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::Encoding;
use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::Path;

/// テキストとして読み込む最大のバイト数.
const MAX_TEXT_BYTES: u64 = 256 * 1024;
/// 画像として読み込む最大のバイト数.
const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;
/// バイナリのダンプに使うバイト数.
const HEX_DUMP_BYTES: usize = 1024;
/// バイナリかどうかを, NUL バイトの有無で判定する先頭のバイト数.
const BINARY_SNIFF_BYTES: usize = 8000;

/// プレビューの種類.
#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PreviewKind {
    /// テキスト.
    Text,
    /// 画像.
    Image,
    /// バイナリ (16 進ダンプ).
    Binary,
}

/// プレビューの内容.
#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct Preview {
    /// プレビューの種類.
    pub kind: PreviewKind,
    /// ファイルのサイズ (バイト).
    pub size: u64,
    /// テキストの文字コード. テキスト以外では `None`.
    pub encoding: Option<String>,
    /// テキスト, またはバイナリの 16 進ダンプ. 画像では `None`.
    pub text: Option<String>,
    /// 画像の data URL. 画像以外では `None`.
    pub data_url: Option<String>,
    /// 先頭部分だけを読み込んだ場合は `true`.
    pub truncated: bool,
}

/// 拡張子から画像の MIME タイプを返します.
///
/// # Arguments
///
/// * `path` - 対象のパス.
///
/// # Returns
///
/// 画像の場合は MIME タイプ. それ以外は `None`.
fn image_mime(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

/// バイト列を, 16 進ダンプの文字列にします.
///
/// # Arguments
///
/// * `bytes` - 対象のバイト列.
///
/// # Returns
///
/// 1 行 16 バイトの, オフセット・16 進・ASCII を並べた文字列.
fn hex_dump(bytes: &[u8]) -> String {
    bytes
        .chunks(16)
        .enumerate()
        .map(|(i, chunk)| {
            let hex: Vec<String> = chunk.iter().map(|b| format!("{:02x}", b)).collect();
            let ascii: String = chunk
                .iter()
                .map(|&b| {
                    if (0x20..0x7f).contains(&b) {
                        b as char
                    } else {
                        '.'
                    }
                })
                .collect();
            format!("{:08x}  {:<47}  |{}|", i * 16, hex.join(" "), ascii)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// バイト列を, 文字コードを判別してテキストにします.
///
/// BOM, UTF-8, それ以外 (Shift_JIS や EUC-JP など) の順に判別します.
///
/// # Arguments
///
/// * `bytes` - 対象のバイト列.
/// * `truncated` - ファイルの先頭部分だけを読んだ場合は `true` (末尾の文字が途切れていてもよい).
///
/// # Returns
///
/// (文字コード名, テキスト).
fn decode_text(bytes: &[u8], truncated: bool) -> (String, String) {
    if let Some((encoding, bom_len)) = Encoding::for_bom(bytes) {
        let (text, _) = encoding.decode_without_bom_handling(&bytes[bom_len..]);
        return (encoding.name().to_string(), text.into_owned());
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => return ("UTF-8".to_string(), text.to_string()),
        Err(e) if truncated && e.error_len().is_none() => {
            let text = String::from_utf8_lossy(&bytes[..e.valid_up_to()]).into_owned();
            return ("UTF-8".to_string(), text);
        }
        Err(_) => {}
    }
    let mut detector = EncodingDetector::new(Iso2022JpDetection::Allow);
    detector.feed(bytes, !truncated);
    let encoding = detector.guess(None, Utf8Detection::Deny);
    let (text, _) = encoding.decode_without_bom_handling(bytes);
    (encoding.name().to_string(), text.into_owned())
}

/// ファイルのプレビューを作ります.
///
/// 画像は data URL, テキストは文字コードを判別した文字列, それ以外は 16 進ダンプにします.
///
/// # Arguments
///
/// * `path` - 対象のファイル.
///
/// # Returns
///
/// プレビュー. ディレクトリ・存在しないパス・大きすぎる画像・読み込みに失敗した場合は [`Err`].
pub fn build_preview(path: &Path) -> Result<Preview, String> {
    let metadata =
        fs::metadata(path).map_err(|_| format!("Path does not exist: {}", path.display()))?;
    if metadata.is_dir() {
        return Err("Directories cannot be previewed".to_string());
    }
    let size = metadata.len();

    if let Some(mime) = image_mime(path) {
        if size > MAX_IMAGE_BYTES {
            return Err(format!("Image is too large to preview: {} bytes", size));
        }
        let bytes = fs::read(path).map_err(|e| e.to_string())?;
        return Ok(Preview {
            kind: PreviewKind::Image,
            size,
            encoding: None,
            text: None,
            data_url: Some(format!("data:{};base64,{}", mime, STANDARD.encode(bytes))),
            truncated: false,
        });
    }

    let mut bytes = Vec::new();
    fs::File::open(path)
        .and_then(|f| f.take(MAX_TEXT_BYTES).read_to_end(&mut bytes))
        .map_err(|e| e.to_string())?;
    let truncated = size > MAX_TEXT_BYTES;

    let sniff = &bytes[..bytes.len().min(BINARY_SNIFF_BYTES)];
    if Encoding::for_bom(&bytes).is_none() && sniff.contains(&0) {
        return Ok(Preview {
            kind: PreviewKind::Binary,
            size,
            encoding: None,
            text: Some(hex_dump(&bytes[..bytes.len().min(HEX_DUMP_BYTES)])),
            data_url: None,
            truncated: size > HEX_DUMP_BYTES as u64,
        });
    }
    let (encoding, text) = decode_text(&bytes, truncated);
    Ok(Preview {
        kind: PreviewKind::Text,
        size,
        encoding: Some(encoding),
        text: Some(text),
        data_url: None,
        truncated,
    })
}

/// ファイルのプレビューを取得します.
///
/// # Arguments
///
/// * `path` - 対象のファイルのパス.
///
/// # Returns
///
/// プレビュー. 失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command(async)]
pub fn read_preview(path: String) -> Result<Preview, String> {
    build_preview(Path::new(&path))
}

#[cfg(test)]
mod tests {
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
}
