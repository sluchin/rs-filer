//! 標準エラー出力とログファイルの両方へ出力するログの初期化, およびログファイルのローテーションを行うモジュール.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Stderr, Write};
use std::path::{Path, PathBuf};

/// 1 つのログファイルの最大サイズ (バイト). これを超える書き込みの前に, ローテートします.
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
/// 保持する, ローテート済みログファイルの世代数 (`rsfiler.log.1` 〜 `.<この数>`).
const MAX_BACKUPS: u32 = 3;

/// ローテート済みファイルの世代を表す, パスの末尾 (`<path>.<generation>`) を返します.
///
/// # Arguments
///
/// * `path` - 元のログファイルのパス.
/// * `generation` - 世代 (1 が最新, 数が大きいほど古い).
///
/// # Returns
///
/// ローテート済みファイルのパス.
fn backup_path(path: &Path, generation: u32) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(format!(".{}", generation));
    PathBuf::from(name)
}

/// サイズが上限を超えたらローテートしながら書き込む, ログファイルの書き込み先.
struct RotatingFile {
    /// ログファイル本体のパス (ローテートしても変わらない).
    path: PathBuf,
    /// ローテートする最大サイズ (バイト).
    max_bytes: u64,
    /// 保持するローテート済みファイルの世代数.
    max_backups: u32,
    /// 開いているログファイル.
    file: File,
    /// 現在のログファイルへ, これまでに書き込んだバイト数.
    size: u64,
}

impl RotatingFile {
    /// 指定したパスのログファイルを, 追記モードで開きます. 親ディレクトリが無ければ作成します.
    ///
    /// # Arguments
    ///
    /// * `path` - ログファイルのパス.
    /// * `max_bytes` - ローテートする最大サイズ (バイト).
    /// * `max_backups` - 保持するローテート済みファイルの世代数.
    ///
    /// # Returns
    ///
    /// 成功した場合は [`Ok`]. 親ディレクトリの作成やファイルを開くのに失敗した場合は [`Err`].
    fn open(path: &Path, max_bytes: u64, max_backups: u32) -> io::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let file = OpenOptions::new().create(true).append(true).open(path)?;
        let size = file.metadata()?.len();
        Ok(Self {
            path: path.to_path_buf(),
            max_bytes,
            max_backups,
            file,
            size,
        })
    }

    /// 現在のログファイルを世代送りし (`.1` を `.2` に, というように), 新しい空のログファイルを開きます.
    ///
    /// # Returns
    ///
    /// 成功した場合は [`Ok`]. ファイルの移動や作成に失敗した場合は [`Err`].
    fn rotate(&mut self) -> io::Result<()> {
        // 最も古い世代から消す. 先に消しておかないと, 直後の世代送りで移動先が衝突する.
        let oldest = backup_path(&self.path, self.max_backups);
        if oldest.exists() {
            fs::remove_file(&oldest)?;
        }
        for generation in (1..self.max_backups).rev() {
            let from = backup_path(&self.path, generation);
            if from.exists() {
                fs::rename(&from, backup_path(&self.path, generation + 1))?;
            }
        }
        if self.max_backups > 0 {
            fs::rename(&self.path, backup_path(&self.path, 1))?;
        }
        self.file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        self.size = 0;
        Ok(())
    }
}

impl Write for RotatingFile {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if self.size + buf.len() as u64 > self.max_bytes {
            self.rotate()?;
        }
        let written = self.file.write(buf)?;
        self.size += written as u64;
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}

/// 2 つの書き込み先へ, 同じ内容を書き込む出力先. 一方が失敗しても, もう一方への書き込みは続けます.
struct Tee<A: Write, B: Write> {
    /// 1 つ目の書き込み先.
    first: A,
    /// 2 つ目の書き込み先.
    second: B,
}

impl<A: Write, B: Write> Write for Tee<A, B> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        // ログの出力先の一方が失敗しても (ディスクが一杯など), もう一方は出力を続けたいので,
        // 個別のエラーは無視し, 呼び出し元には常に成功として返す.
        let _ = self.first.write_all(buf);
        let _ = self.second.write_all(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        let _ = self.first.flush();
        let _ = self.second.flush();
        Ok(())
    }
}

/// データディレクトリから, ログファイルのパスを求めます.
///
/// # Arguments
///
/// * `data_dir` - OS のデータディレクトリ.
///
/// # Returns
///
/// `<データディレクトリ>/rsfiler/logs/rsfiler.log`.
fn log_path_from(data_dir: &Path) -> PathBuf {
    data_dir.join("rsfiler").join("logs").join("rsfiler.log")
}

/// 既定のログファイルのパスを返します.
///
/// # Returns
///
/// ログファイルのパス. データディレクトリを取得できない場合は [`None`].
fn default_log_path() -> Option<PathBuf> {
    dirs::data_local_dir().map(|dir| log_path_from(&dir))
}

/// ログ出力を初期化します. 標準エラー出力と, ローテートするログファイルの両方へ出力します.
///
/// ログレベルは環境変数 `RUST_LOG` で変更できます (既定はエラーのみ).
/// ログファイルを開けない場合 (データディレクトリを取得できない, 権限が無いなど) は,
/// 標準エラー出力のみへ出力します.
// グローバルなロガーを 1 度だけ初期化するもので, 実際のデータディレクトリにも依存するため,
// cargo test では検証できない (ロジックは RotatingFile / Tee / log_path_from で検証する).
#[cfg(not(tarpaulin_include))]
pub fn init_logging() {
    let mut builder = env_logger::Builder::from_default_env();
    if let Some(path) = default_log_path() {
        if let Ok(file) = RotatingFile::open(&path, MAX_LOG_BYTES, MAX_BACKUPS) {
            builder.target(env_logger::Target::Pipe(Box::new(Tee {
                first: io::stderr() as Stderr,
                second: file,
            })));
        }
    }
    builder.init();
}

#[cfg(test)]
mod tests {
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
}
