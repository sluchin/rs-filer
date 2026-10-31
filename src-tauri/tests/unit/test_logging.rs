//! `logging` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `logging` の子モジュール (`#[path]`) として組み込む.

use super::*;
use tempfile::tempdir;

#[test]
fn test_backup_path_success() {
    assert_eq!(
        backup_path(Path::new("/logs/a.log"), 2),
        Path::new("/logs/a.log.2")
    );
}

#[test]
fn test_log_path_from_success() {
    assert_eq!(
        log_path_from(Path::new("/data")),
        Path::new("/data/rsfiler/logs/rsfiler.log")
    );
}

#[test]
fn test_rotating_file_open_creates_parent_and_resumes_size() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("sub/rsfiler.log");

    let mut file = RotatingFile::open(&path, 1024, 3).unwrap();
    file.write_all(b"hello").unwrap();
    drop(file);

    let reopened = RotatingFile::open(&path, 1024, 3).unwrap();
    assert_eq!(reopened.size, 5);
    assert_eq!(fs::read_to_string(&path).unwrap(), "hello");
}

#[test]
fn test_rotating_file_rotates_and_keeps_max_backups() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("rsfiler.log");
    let mut file = RotatingFile::open(&path, 10, 3).unwrap();

    // 1 回目のローテート: 現在のログが .1 になる.
    file.write_all(b"aaaaaaaaaaa").unwrap();
    assert_eq!(fs::read_to_string(backup_path(&path, 1)).unwrap(), "");
    assert_eq!(fs::read_to_string(&path).unwrap(), "aaaaaaaaaaa");

    // 2 回目: 直前の .1 が .2 になり, 現在のログが新しい .1 になる.
    file.write_all(b"bbbbbbbbbbb").unwrap();
    assert_eq!(fs::read_to_string(backup_path(&path, 2)).unwrap(), "");
    assert_eq!(
        fs::read_to_string(backup_path(&path, 1)).unwrap(),
        "aaaaaaaaaaa"
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "bbbbbbbbbbb");

    // 3 回目: .1 → .2, .2 → .3.
    file.write_all(b"ccccccccccc").unwrap();
    assert_eq!(
        fs::read_to_string(backup_path(&path, 1)).unwrap(),
        "bbbbbbbbbbb"
    );
    assert_eq!(
        fs::read_to_string(backup_path(&path, 2)).unwrap(),
        "aaaaaaaaaaa"
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "ccccccccccc");

    // 4 回目: 最大世代数 (3) を超える最も古い世代 (直前の空の .3) が消え, 世代が 1 つずつ進む.
    file.write_all(b"ddddddddddd").unwrap();
    assert_eq!(
        fs::read_to_string(backup_path(&path, 3)).unwrap(),
        "aaaaaaaaaaa"
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "ddddddddddd");
}

#[test]
fn test_rotating_file_small_writes_do_not_rotate() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("rsfiler.log");
    let mut file = RotatingFile::open(&path, 1024, 3).unwrap();

    file.write_all(b"a").unwrap();
    file.write_all(b"b").unwrap();

    assert_eq!(fs::read_to_string(&path).unwrap(), "ab");
    assert!(!backup_path(&path, 1).exists());
}

#[test]
fn test_tee_writes_to_both_and_tolerates_failure() {
    struct Failing;
    impl Write for Failing {
        fn write(&mut self, _buf: &[u8]) -> io::Result<usize> {
            Err(io::Error::other("boom"))
        }
        fn flush(&mut self) -> io::Result<()> {
            Err(io::Error::other("boom"))
        }
    }

    let mut ok = Vec::new();
    {
        let mut tee = Tee {
            first: &mut ok,
            second: Failing,
        };
        tee.write_all(b"hello").unwrap();
        tee.flush().unwrap();
    }
    assert_eq!(ok, b"hello");

    let mut a = Vec::new();
    let mut b = Vec::new();
    {
        let mut tee = Tee {
            first: &mut a,
            second: &mut b,
        };
        tee.write_all(b"hi").unwrap();
    }
    assert_eq!(a, b"hi");
    assert_eq!(b, b"hi");
}

#[test]
fn test_default_log_path_success() {
    // 実行環境に依存するが, テスト環境でも通常は取得できる (取得できない場合は None も許容する).
    if let Some(path) = default_log_path() {
        assert!(path.ends_with("rsfiler/logs/rsfiler.log"));
    }
}

#[test]
fn test_rotating_file_flush_success() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("rsfiler.log");
    let mut file = RotatingFile::open(&path, 1024, 3).unwrap();

    file.write_all(b"x").unwrap();
    file.flush().unwrap();

    assert_eq!(fs::read_to_string(&path).unwrap(), "x");
}

/// 記録を [`write_record`] で書いた 1 行を返す (時刻帯は +09:00).
fn render(record: &Record, now: DateTime<Utc>) -> String {
    let mut out = Vec::new();
    let tz = chrono::FixedOffset::east_opt(9 * 3600).unwrap();
    write_record(&mut out, record, &tz, now).unwrap();
    String::from_utf8(out).unwrap()
}

#[test]
fn test_write_record_uses_now_in_local_time_with_millis() {
    let now = DateTime::from_timestamp_millis(1_761_351_931_005).unwrap();

    let line = render(
        &Record::builder()
            .args(format_args!("hello"))
            .level(log::Level::Info)
            .target("rsfiler::commands::app")
            .file(Some("src/commands/app.rs"))
            .line(Some(42))
            .build(),
        now,
    );

    assert_eq!(
        line,
        "2025-10-25T09:25:31.005+09:00 [INFO]  commands/app.rs:42 hello\n"
    );
}

#[test]
fn test_write_record_prefers_time_key() {
    let now = DateTime::from_timestamp_millis(1_761_351_999_000).unwrap();
    let kvs = [(TIME_KEY, 1_761_351_931_123_i64)];

    let line = render(
        &Record::builder()
            .args(format_args!("from front"))
            .level(log::Level::Error)
            .target("frontend::explorer")
            .key_values(&kvs)
            .build(),
        now,
    );

    assert_eq!(
        line,
        "2025-10-25T09:25:31.123+09:00 [ERROR] front/explorer from front\n"
    );
}

#[test]
fn test_write_record_out_of_range_time_falls_back_to_now() {
    let now = DateTime::from_timestamp_millis(1_761_351_931_005).unwrap();
    let kvs = [(TIME_KEY, i64::MAX)];

    let line = render(
        &Record::builder()
            .args(format_args!("x"))
            .level(log::Level::Warn)
            .target("frontend")
            .key_values(&kvs)
            .build(),
        now,
    );

    assert_eq!(line, "2025-10-25T09:25:31.005+09:00 [WARN]  front x\n");
}

/// ターゲット・ファイル・行番号だけを指定した記録の, ログを出した場所を返す.
fn location_of(target: &str, file: Option<&str>, line: Option<u32>) -> String {
    location(
        &Record::builder()
            .target(target)
            .file(file)
            .line(line)
            .build(),
    )
}

#[test]
fn test_location_own_crate_strips_src() {
    assert_eq!(
        location_of(
            "rsfiler::commands::app",
            Some("src/commands/app.rs"),
            Some(42)
        ),
        "commands/app.rs:42"
    );
    // src/ の外 (テストなど) は, 相対パスのまま.
    assert_eq!(
        location_of("rsfiler", Some("tests/unit/a.rs"), Some(1)),
        "tests/unit/a.rs:1"
    );
    // Windows の区切り.
    assert_eq!(
        location_of("rsfiler", Some("src\\commands\\app.rs"), Some(7)),
        "commands/app.rs:7"
    );
}

#[test]
fn test_location_external_crate_is_crate_and_file_name() {
    assert_eq!(
        location_of(
            "tao::platform_impl::linux",
            Some("/home/u/.cargo/registry/src/index/tao-0.30.0/src/platform_impl/linux/mod.rs"),
            Some(120),
        ),
        "tao/mod.rs:120"
    );
}

#[test]
fn test_location_without_file_or_line() {
    assert_eq!(location_of("some::module", None, Some(1)), "some::module");
    assert_eq!(
        location_of("rsfiler::app", Some("src/app.rs"), None),
        "app.rs"
    );
}

#[test]
fn test_location_frontend() {
    assert_eq!(location_of("frontend", None, None), "front");
    assert_eq!(location_of("frontend::tree", None, None), "front/tree");
    // 転送したコマンドの場所ではなく, フロントエンドの機能名を出す.
    assert_eq!(
        location_of(
            "frontend::tree",
            Some("src/commands/frontend_log.rs"),
            Some(84)
        ),
        "front/tree"
    );
    // frontend で始まるだけの別のターゲットは, 通常どおり.
    assert_eq!(
        location_of("frontends::x", Some("src/x.rs"), Some(3)),
        "x.rs:3"
    );
}
