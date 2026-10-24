//! ファイルのプレビュー (テキスト・画像・バイナリ) を取得するコマンド.

use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::Encoding;
use serde::Serialize;
use specta::Type;
use std::fs;
use std::io::Read;
use std::path::Path;
use tauri::{AppHandle, Manager, Runtime};

/// テキストとして読み込む最大のバイト数.
const MAX_TEXT_BYTES: u64 = 256 * 1024;
/// 画像としてプレビューする最大のバイト数.
const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;
/// バイナリのダンプに使うバイト数.
const HEX_DUMP_BYTES: usize = 1024;
/// バイナリかどうかを, NUL バイトの有無で判定する先頭のバイト数.
const BINARY_SNIFF_BYTES: usize = 8000;

/// プレビューの種類.
#[derive(Serialize, Type, Debug, PartialEq, Eq)]
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
#[derive(Serialize, Type, Debug, PartialEq, Eq)]
pub struct Preview {
    /// プレビューの種類.
    pub kind: PreviewKind,
    /// ファイルのサイズ (バイト).
    pub size: u64,
    /// テキストの文字コード. テキスト以外では `None`.
    pub encoding: Option<String>,
    /// テキスト, またはバイナリの 16 進ダンプ. 画像では `None`.
    pub text: Option<String>,
    /// 先頭部分だけを読み込んだ場合は `true`.
    pub truncated: bool,
}

/// 拡張子から, 画像 (画面に表示できる形式) かどうかを返します.
///
/// # Arguments
///
/// * `path` - 対象のパス.
///
/// # Returns
///
/// 画像の場合は `true`.
fn is_image(path: &Path) -> bool {
    path.extension().is_some_and(|ext| {
        matches!(
            ext.to_string_lossy().to_lowercase().as_str(),
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "svg"
        )
    })
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
    // BOM があれば, それが最も確実な判定なので優先する.
    if let Some((encoding, bom_len)) = Encoding::for_bom(bytes) {
        let (text, _) = encoding.decode_without_bom_handling(&bytes[bom_len..]);
        return (encoding.name().to_string(), text.into_owned());
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => return ("UTF-8".to_string(), text.to_string()),
        Err(e) if truncated && e.error_len().is_none() => {
            // 先頭部分だけを読んだ場合, 末尾が文字の途中で切れているだけなら UTF-8 として扱ってよい.
            // (`error_len` が None は「不正なバイト列」ではなく「データ不足」を意味する.)
            let text = String::from_utf8_lossy(&bytes[..e.valid_up_to()]).into_owned();
            return ("UTF-8".to_string(), text);
        }
        Err(_) => {}
    }
    // UTF-8 でなければ, Shift_JIS や EUC-JP などを統計的に推測する.
    let mut detector = EncodingDetector::new(Iso2022JpDetection::Allow);
    detector.feed(bytes, !truncated);
    let encoding = detector.guess(None, Utf8Detection::Deny);
    let (text, _) = encoding.decode_without_bom_handling(bytes);
    (encoding.name().to_string(), text.into_owned())
}

/// ファイルのプレビューを作ります.
///
/// 画像は中身を読まずに種類とサイズだけを返し (画面は asset プロトコルでファイルを直接読む),
/// テキストは文字コードを判別した文字列, それ以外は 16 進ダンプにします.
///
/// # Arguments
///
/// * `path` - 対象のファイル.
///
/// # Returns
///
/// プレビュー. ディレクトリ・通常のファイルでないもの (名前付きパイプ・デバイスなど)・存在しないパス・
/// 大きすぎる画像・読み込みに失敗した場合は [`Err`].
pub fn build_preview(path: &Path) -> Result<Preview, String> {
    let metadata =
        fs::metadata(path).map_err(|_| format!("Path does not exist: {}", path.display()))?;
    if metadata.is_dir() {
        return Err("Directories cannot be previewed".to_string());
    }
    // 名前付きパイプやデバイスは, 開いたり読んだりすると戻ってこないことがあるため, 通常のファイルに限る.
    if !metadata.is_file() {
        return Err("Only regular files can be previewed".to_string());
    }
    let size = metadata.len();

    if is_image(path) {
        if size > MAX_IMAGE_BYTES {
            return Err(format!("Image is too large to preview: {} bytes", size));
        }
        return Ok(Preview {
            kind: PreviewKind::Image,
            size,
            encoding: None,
            text: None,
            truncated: false,
        });
    }

    // 画像以外は, 大きなファイルでも重くならないよう先頭部分だけ読む.
    let mut bytes = Vec::new();
    fs::File::open(path)
        .and_then(|f| f.take(MAX_TEXT_BYTES).read_to_end(&mut bytes))
        .map_err(|e| e.to_string())?;
    let truncated = size > MAX_TEXT_BYTES;

    // BOM 付きの UTF-16 テキストなどを誤判定しないよう, BOM が無い場合だけ NUL バイトの有無で
    // バイナリかどうかを判定する.
    let sniff = &bytes[..bytes.len().min(BINARY_SNIFF_BYTES)];
    if Encoding::for_bom(&bytes).is_none() && sniff.contains(&0) {
        return Ok(Preview {
            kind: PreviewKind::Binary,
            size,
            encoding: None,
            text: Some(hex_dump(&bytes[..bytes.len().min(HEX_DUMP_BYTES)])),
            truncated: size > HEX_DUMP_BYTES as u64,
        });
    }
    let (encoding, text) = decode_text(&bytes, truncated);
    Ok(Preview {
        kind: PreviewKind::Text,
        size,
        encoding: Some(encoding),
        text: Some(text),
        truncated,
    })
}

/// ファイルのプレビューを取得します.
///
/// 画像の場合は, 画面が asset プロトコルで読めるよう, そのファイルだけを asset プロトコルの範囲に加えます
/// (`tauri.conf.json` では, どのファイルも許可していない).
///
/// # Arguments
///
/// * `app` - アプリケーションのハンドル (asset プロトコルの範囲を変えるのに使う).
/// * `path` - 対象のファイルのパス.
///
/// # Returns
///
/// プレビュー. 失敗した場合はエラー文字列を含む [`Err`].
#[tauri::command(async)]
#[specta::specta]
pub fn read_preview<R: Runtime>(app: AppHandle<R>, path: String) -> Result<Preview, String> {
    let result = build_preview(Path::new(&path)).and_then(|preview| {
        if preview.kind == PreviewKind::Image {
            app.asset_protocol_scope()
                .allow_file(&path)
                .map_err(|e| e.to_string())?;
        }
        Ok(preview)
    });
    if let Err(e) = &result {
        log::error!("プレビュー取得失敗: {} ({})", path, e);
    }
    result
}

#[cfg(test)]
#[path = "../../tests/unit/commands/preview_test.rs"]
mod tests;
