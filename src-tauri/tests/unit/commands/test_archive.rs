//! `commands::archive` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `commands::archive` の子モジュール (`#[path]`) として組み込む.

use super::*;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::Write;
use tempfile::tempdir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

/// 項目の種類と名前と中身.
enum Item<'a> {
    /// ディレクトリ.
    Dir(&'a str),
    /// ファイル (名前, 中身, 圧縮して setuid 付きの実行の権限を付けるか).
    File(&'a str, &'a str, bool),
    /// シンボリックリンク (名前, リンク先).
    Symlink(&'a str, &'a str),
}

/// 項目を並べた zip ファイルを作ります.
///
/// # Arguments
///
/// * `path` - 作る zip ファイルのパス.
/// * `items` - 項目.
fn write_zip(path: &Path, items: &[Item]) {
    let mut zip = ZipWriter::new(fs::File::create(path).unwrap());
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    for item in items {
        match item {
            Item::Dir(name) => zip.add_directory(*name, stored).unwrap(),
            Item::File(name, content, deflate) => {
                let options = if *deflate {
                    stored
                        .compression_method(CompressionMethod::Deflated)
                        .unix_permissions(0o4755)
                } else {
                    stored
                };
                zip.start_file(*name, options).unwrap();
                zip.write_all(content.as_bytes()).unwrap();
            }
            Item::Symlink(name, target) => zip.add_symlink(*name, *target, stored).unwrap(),
        }
    }
    zip.finish().unwrap();
}

/// tar の項目の見出しを作ります. 名前は, 検査をせずに, そのまま書きます (`..` や Shift_JIS も書ける).
///
/// # Arguments
///
/// * `name` - 名前 (100 バイト未満).
/// * `kind` - 種類.
/// * `size` - 中身の大きさ.
/// * `mode` - 権限.
///
/// # Returns
///
/// 見出し.
fn tar_header(name: &[u8], kind: EntryType, size: usize, mode: u32) -> tar::Header {
    let mut header = tar::Header::new_gnu();
    header.as_old_mut().name[..name.len()].copy_from_slice(name);
    header.set_entry_type(kind);
    header.set_size(size as u64);
    header.set_mode(mode);
    header.set_cksum();
    header
}

/// 項目を並べた tar の中身を作ります.
///
/// # Arguments
///
/// * `items` - 項目.
///
/// # Returns
///
/// tar の中身.
fn tar_bytes(items: &[Item]) -> Vec<u8> {
    let mut builder = tar::Builder::new(Vec::new());
    for item in items {
        match item {
            Item::Dir(name) => builder
                .append(
                    &tar_header(name.as_bytes(), EntryType::Directory, 0, 0o755),
                    &[][..],
                )
                .unwrap(),
            Item::File(name, content, exec) => {
                let mode = if *exec { 0o4755 } else { 0o644 };
                let header = tar_header(name.as_bytes(), EntryType::Regular, content.len(), mode);
                builder.append(&header, content.as_bytes()).unwrap();
            }
            Item::Symlink(name, target) => {
                let mut header = tar_header(name.as_bytes(), EntryType::Symlink, 0, 0o777);
                header.set_link_name(target).unwrap();
                header.set_cksum();
                builder.append(&header, &[][..]).unwrap();
            }
        }
    }
    builder.into_inner().unwrap()
}

/// 中身を gzip で圧縮します.
///
/// # Arguments
///
/// * `bytes` - 中身.
///
/// # Returns
///
/// 圧縮した中身.
fn gzip(bytes: &[u8]) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(bytes).unwrap();
    encoder.finish().unwrap()
}

/// 項目を並べたアーカイブを, 名前の拡張子の形式で作ります.
///
/// # Arguments
///
/// * `path` - 作るアーカイブのパス (`.zip`, `.tar`, `.tar.gz`, `.tgz`).
/// * `items` - 項目.
fn write_archive(path: &Path, items: &[Item]) {
    match archive_format(path).unwrap() {
        ArchiveFormat::Zip => write_zip(path, items),
        ArchiveFormat::Tar => fs::write(path, tar_bytes(items)).unwrap(),
        ArchiveFormat::TarGz => fs::write(path, gzip(&tar_bytes(items))).unwrap(),
    }
}

/// 全ての形式の, アーカイブの名前.
const ARCHIVES: [&str; 4] = ["a.zip", "a.tar", "a.tar.gz", "a.tgz"];

#[test]
fn test_archive_format_by_name() {
    for (name, format) in [
        ("a.zip", Some(ArchiveFormat::Zip)),
        ("A.ZIP", Some(ArchiveFormat::Zip)),
        ("a.tar", Some(ArchiveFormat::Tar)),
        ("a.tar.gz", Some(ArchiveFormat::TarGz)),
        ("a.TGZ", Some(ArchiveFormat::TarGz)),
        ("a.gz", None),
        ("a.txt", None),
        ("/", None),
    ] {
        assert_eq!(archive_format(Path::new(name)), format, "name: {}", name);
    }
}

#[test]
fn test_entry_name_encodings() {
    assert_eq!(entry_name("dir/a.txt".as_bytes()), "dir/a.txt");
    // Shift_JIS の「日本語.txt」
    assert_eq!(
        entry_name(b"\x93\xfa\x96\x7b\x8c\xea.txt"),
        "日本語.txt".to_string()
    );
    // どちらでも読めなければ, 置き換える
    assert_eq!(entry_name(b"\x81 a"), "\u{fffd} a");
}

#[test]
fn test_entry_path_relative_and_unsafe() {
    assert_eq!(
        entry_path("a/b\\c.txt").unwrap(),
        Path::new("a").join("b").join("c.txt")
    );
    assert_eq!(entry_path("/./a//b/").unwrap(), Path::new("a").join("b"));
    assert_eq!(entry_path("/").unwrap(), PathBuf::new());
    for name in ["../a", "a/../../b", "a\\..\\b", "C:/a", "a:stream"] {
        assert!(entry_path(name).is_err(), "name: {:?}", name);
    }
}

#[test]
fn test_extract_archive_success() {
    for archive_name in ARCHIVES {
        let dir = tempdir().unwrap();
        let archive = dir.path().join(archive_name);
        write_archive(
            &archive,
            &[
                Item::Dir("top/"),
                Item::File("top/a.txt", "stored", false),
                // ディレクトリの項目が無い, 深いファイル
                Item::File("top/sub/deep/b.sh", "deflated deflated deflated", true),
                Item::Dir("./"),
                Item::Dir("empty/"),
                Item::Symlink("link", "/etc/passwd"),
            ],
        );
        let parent = dir.path().to_string_lossy().to_string();
        extract_archive(
            archive.to_string_lossy().to_string(),
            parent,
            " out ".to_string(),
        )
        .unwrap();

        let out = dir.path().join("out");
        assert_eq!(fs::read_to_string(out.join("top/a.txt")).unwrap(), "stored");
        assert_eq!(
            fs::read_to_string(out.join("top/sub/deep/b.sh")).unwrap(),
            "deflated deflated deflated"
        );
        assert!(out.join("empty").is_dir(), "{}", archive_name);
        // シンボリックリンクは, 書き出さない
        assert!(fs::symlink_metadata(out.join("link")).is_err());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            // 権限は, 読み・書き・実行だけ (setuid は付けない)
            let mode = fs::metadata(out.join("top/sub/deep/b.sh"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o7777, 0o755, "{}", archive_name);
        }
    }
}

#[test]
fn test_extract_archive_to_tar_names() {
    let dir = tempdir().unwrap();
    // Shift_JIS の名前と, 100 バイトを超える名前 (GNU の長い名前)
    let long = format!("{}/{}.txt", "d".repeat(80), "f".repeat(80));
    let mut builder = tar::Builder::new(Vec::new());
    let sjis = tar_header(
        b"\x93\xfa\x96\x7b\x8c\xea.txt",
        EntryType::Regular,
        2,
        0o644,
    );
    builder.append(&sjis, &b"ja"[..]).unwrap();
    let mut header = tar::Header::new_gnu();
    header.set_size(4);
    header.set_mode(0o644);
    builder
        .append_data(&mut header, &long, &b"long"[..])
        .unwrap();
    let archive = dir.path().join("names.tar.gz");
    fs::write(&archive, gzip(&builder.into_inner().unwrap())).unwrap();

    let dest = dir.path().join("out");
    extract_archive_to(&archive, &dest).unwrap();
    assert_eq!(fs::read_to_string(dest.join("日本語.txt")).unwrap(), "ja");
    assert_eq!(fs::read_to_string(dest.join(&long)).unwrap(), "long");
}

#[test]
fn test_extract_archive_rejects_bad_destination() {
    let dir = tempdir().unwrap();
    let archive = dir.path().join("a.zip");
    write_zip(&archive, &[Item::File("a.txt", "a", false)]);
    let path = archive.to_string_lossy().to_string();
    let parent = dir.path().to_string_lossy().to_string();
    // 名前が不正
    assert!(extract_archive(path.clone(), parent.clone(), "..".to_string()).is_err());
    // 展開先が既にある (中身は, そのまま)
    fs::create_dir(dir.path().join("out")).unwrap();
    fs::write(dir.path().join("out/keep.txt"), "keep").unwrap();
    assert!(extract_archive(path, parent, "out".to_string()).is_err());
    assert_eq!(
        fs::read_to_string(dir.path().join("out/keep.txt")).unwrap(),
        "keep"
    );
    assert!(!dir.path().join("out/a.txt").exists());
}

#[test]
fn test_extract_archive_to_rejects_bad_archive() {
    let dir = tempdir().unwrap();
    let dest = dir.path().join("out");
    // 展開できない形式と, 無いファイル
    let text = dir.path().join("a.txt");
    fs::write(&text, "text").unwrap();
    assert!(extract_archive_to(&text, &dest).is_err());
    assert!(extract_archive_to(&dir.path().join("none.zip"), &dest).is_err());
    // 名前と形式が合わないファイル
    for archive_name in ARCHIVES {
        let archive = dir.path().join(archive_name);
        fs::write(&archive, "not an archive").unwrap();
        assert!(
            extract_archive_to(&archive, &dest).is_err(),
            "{}",
            archive_name
        );
        assert!(!dest.exists(), "{}", archive_name);
    }
}

#[test]
fn test_extract_archive_to_removes_destination_on_failure() {
    let dir = tempdir().unwrap();
    let dest = dir.path().join("out");
    let cases: Vec<Vec<Item>> = vec![
        // 展開先の外を指す
        vec![
            Item::File("ok.txt", "ok", false),
            Item::File("../evil.txt", "evil", false),
        ],
        // ファイルの下にファイル (親のディレクトリを作れない)
        vec![Item::File("a", "a", false), Item::File("a/b", "b", false)],
        // ファイルと同じ名前のディレクトリ
        vec![Item::File("a", "a", false), Item::Dir("a/")],
        // ディレクトリと同じ名前のファイル
        vec![Item::Dir("a/"), Item::File("a", "a", false)],
    ];
    for archive_name in ARCHIVES {
        for (i, items) in cases.iter().enumerate() {
            let archive = dir.path().join(format!("{}-{}", i, archive_name));
            write_archive(&archive, items);
            let case = format!("{} {}", archive_name, i);
            assert!(extract_archive_to(&archive, &dest).is_err(), "{}", case);
            assert!(!dest.exists(), "{}", case);
        }
    }
    assert!(!dir.path().join("evil.txt").exists());
}

#[test]
fn test_extract_archive_to_fails_on_broken_data() {
    let dir = tempdir().unwrap();
    // zip: 中身を書き換えて, CRC を合わなくする
    let archive = dir.path().join("broken.zip");
    write_zip(&archive, &[Item::File("a.txt", "hello", false)]);
    let mut bytes = fs::read(&archive).unwrap();
    let at = bytes.windows(5).position(|w| w == b"hello").unwrap();
    bytes[at] = b'j';
    fs::write(&archive, bytes).unwrap();
    // tar.gz: 途中で切れている
    let truncated = dir.path().join("broken.tar.gz");
    let bytes = gzip(&tar_bytes(&[Item::File("a.txt", &"x".repeat(4096), false)]));
    fs::write(&truncated, &bytes[..bytes.len() / 2]).unwrap();

    let dest = dir.path().join("out");
    for archive in [archive, truncated] {
        assert!(
            extract_archive_to(&archive, &dest).is_err(),
            "{:?}",
            archive
        );
        assert!(!dest.exists(), "{:?}", archive);
    }
}
