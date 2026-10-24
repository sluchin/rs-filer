//! `commands::transfer` の単体テスト.
//!
//! 非公開の関数も検証するため, 結合テストではなく, `commands::transfer` の子モジュール (`#[path]`) として組み込む.

use super::*;
use std::cell::RefCell;
use tempfile::tempdir;

/// テスト用の依頼を作る.
fn request(kind: TransferKind, sources: &[&Path], dest: Option<&Path>) -> TransferRequest {
    TransferRequest {
        kind,
        sources: sources
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect(),
        dest_dir: dest.map(|p| p.to_string_lossy().into_owned()),
        overwrite: false,
        permanent: true,
        dest_name: None,
        skip: Vec::new(),
    }
}

/// 進捗を記録しながら, 実際の操作で実行する.
fn run(req: &TransferRequest) -> (Result<TransferSummary, String>, Vec<TransferProgress>) {
    let events = RefCell::new(Vec::new());
    let cancel = AtomicBool::new(false);
    let result = transfer(req, &cancel, &mut |p| events.borrow_mut().push(p));
    (result, events.into_inner())
}

#[test]
fn test_transfer_copy_file_success() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    let dest = dir.path().join("dest");
    fs::create_dir(&dest).unwrap();
    fs::write(&src, "hello").unwrap();

    let (result, events) = run(&request(TransferKind::Copy, &[&src], Some(&dest)));

    assert_eq!(
        result.unwrap(),
        TransferSummary {
            processed: 1,
            cancelled: false
        }
    );
    assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "hello");
    assert!(src.exists());
    let last = events.last().unwrap();
    assert_eq!((last.done, last.total), (5, 5));
    assert_eq!(last.current, "a.txt");
}

#[test]
fn test_transfer_copy_directory_recursively() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("d");
    fs::create_dir_all(src.join("sub")).unwrap();
    fs::write(src.join("f1"), "1234").unwrap();
    fs::write(src.join("sub/f2"), "56").unwrap();
    let dest = dir.path().join("dest");
    fs::create_dir(&dest).unwrap();

    let (result, events) = run(&request(TransferKind::Copy, &[&src], Some(&dest)));

    assert!(result.is_ok());
    assert_eq!(fs::read_to_string(dest.join("d/sub/f2")).unwrap(), "56");
    assert_eq!(events.last().unwrap().total, 6);
}

#[test]
fn test_transfer_copy_existing_requires_overwrite() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    let dest = dir.path().join("dest");
    fs::create_dir(&dest).unwrap();
    fs::write(&src, "new").unwrap();
    fs::write(dest.join("a.txt"), "old").unwrap();

    let mut req = request(TransferKind::Copy, &[&src], Some(&dest));
    let (result, _) = run(&req);
    assert!(result.unwrap_err().starts_with("Already exists"));
    assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "old");

    req.overwrite = true;
    assert!(run(&req).0.is_ok());
    assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "new");
}

#[test]
fn test_transfer_copy_same_directory_failure() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    fs::write(&src, "x").unwrap();
    let (result, _) = run(&request(TransferKind::Copy, &[&src], Some(dir.path())));
    assert!(result.unwrap_err().starts_with("Source and destination"));
}

#[test]
fn test_transfer_copy_into_itself_failure() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("d");
    let inner = src.join("inner");
    fs::create_dir_all(&inner).unwrap();
    let (result, _) = run(&request(TransferKind::Copy, &[&src], Some(&inner)));
    assert!(result.unwrap_err().starts_with("Cannot place"));
}

#[test]
fn test_transfer_validation_failure() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("f");
    fs::write(&file, "x").unwrap();
    let missing = dir.path().join("missing");

    assert_eq!(
        run(&request(TransferKind::Copy, &[], Some(dir.path())))
            .0
            .unwrap_err(),
        "No targets"
    );
    assert!(run(&request(TransferKind::Copy, &[&file], None))
        .0
        .unwrap_err()
        .contains("required"));
    assert!(run(&request(TransferKind::Copy, &[&file], Some(&file)))
        .0
        .unwrap_err()
        .contains("not a directory"));
    assert!(
        run(&request(TransferKind::Copy, &[&missing], Some(dir.path())))
            .0
            .unwrap_err()
            .starts_with("Path does not exist")
    );
    assert!(run(&request(
        TransferKind::Copy,
        &[Path::new("/")],
        Some(dir.path())
    ))
    .0
    .unwrap_err()
    .starts_with("Invalid source path"));
}

#[test]
fn test_transfer_move_file_and_directory_success() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("a.txt");
    let sub = dir.path().join("d");
    fs::create_dir_all(&sub).unwrap();
    fs::write(sub.join("x"), "x").unwrap();
    fs::write(&file, "hello").unwrap();
    let dest = dir.path().join("dest");
    fs::create_dir(&dest).unwrap();

    let (result, events) = run(&request(TransferKind::Move, &[&file, &sub], Some(&dest)));

    assert_eq!(result.unwrap().processed, 2);
    assert!(!file.exists() && !sub.exists());
    assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "hello");
    assert!(dest.join("d/x").exists());
    assert_eq!(events.last().unwrap().done, 6);
}

#[test]
fn test_transfer_move_falls_back_to_copy_when_rename_fails() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("a.txt");
    let sub = dir.path().join("d");
    fs::create_dir_all(&sub).unwrap();
    fs::write(sub.join("x"), "x").unwrap();
    fs::write(&file, "hello").unwrap();
    let dest = dir.path().join("dest");
    fs::create_dir(&dest).unwrap();
    let cancel = AtomicBool::new(false);

    let result = transfer_with(
        &request(TransferKind::Move, &[&file, &sub], Some(&dest)),
        &cancel,
        &|_, _| Err(std::io::Error::other("cross device")),
        &|_| Ok(()),
        &mut |_| {},
    );

    assert_eq!(result.unwrap().processed, 2);
    assert!(!file.exists() && !sub.exists());
    assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "hello");
    assert!(dest.join("d/x").exists());
}

#[test]
fn test_transfer_move_overwrite_file_and_refuse_file_onto_directory() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    let dest = dir.path().join("dest");
    fs::create_dir_all(dest.join("d")).unwrap();
    fs::write(&src, "new").unwrap();
    fs::write(dest.join("a.txt"), "old").unwrap();

    let mut req = request(TransferKind::Move, &[&src], Some(&dest));
    req.overwrite = true;
    assert!(run(&req).0.is_ok());
    assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "new");

    // ファイルで, 同名のディレクトリを置き換えることはしない.
    let file_d = dir.path().join("d");
    fs::write(&file_d, "file").unwrap();
    let mut req = request(TransferKind::Move, &[&file_d], Some(&dest));
    req.overwrite = true;
    assert!(run(&req).0.unwrap_err().contains("already exists"));
    assert!(file_d.exists());
    assert!(dest.join("d").is_dir());
}

#[test]
fn test_transfer_move_directory_merges_into_existing_directory() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("d");
    fs::create_dir_all(src.join("sub")).unwrap();
    fs::write(src.join("a.txt"), "new-a").unwrap();
    fs::write(src.join("only_src.txt"), "only").unwrap();
    fs::write(src.join("sub/b.txt"), "new-b").unwrap();
    let dest = dir.path().join("dest");
    fs::create_dir_all(dest.join("d/sub")).unwrap();
    fs::write(dest.join("d/a.txt"), "old-a").unwrap();
    fs::write(dest.join("d/keep.txt"), "keep").unwrap();
    fs::write(dest.join("d/sub/c.txt"), "old-c").unwrap();

    let mut req = request(TransferKind::Move, &[&src], Some(&dest));
    req.overwrite = true;
    let (result, events) = run(&req);

    assert_eq!(result.unwrap().processed, 1);
    // 同名のファイルは上書き, 移動先にだけあるものは残り, 移動元にだけあるものは移る.
    assert_eq!(fs::read_to_string(dest.join("d/a.txt")).unwrap(), "new-a");
    assert_eq!(fs::read_to_string(dest.join("d/keep.txt")).unwrap(), "keep");
    assert_eq!(
        fs::read_to_string(dest.join("d/only_src.txt")).unwrap(),
        "only"
    );
    assert_eq!(
        fs::read_to_string(dest.join("d/sub/b.txt")).unwrap(),
        "new-b"
    );
    assert_eq!(
        fs::read_to_string(dest.join("d/sub/c.txt")).unwrap(),
        "old-c"
    );
    // 移動元のディレクトリは, 空になって消える.
    assert!(!src.exists());
    // 進捗は, 移したバイト数 (5 + 4 + 5) の分まで進む.
    assert_eq!(events.last().unwrap().done, events.last().unwrap().total);
}

#[test]
fn test_transfer_move_directory_onto_existing_requires_overwrite() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("d");
    fs::create_dir(&src).unwrap();
    fs::write(src.join("a.txt"), "new").unwrap();
    let dest = dir.path().join("dest");
    fs::create_dir_all(dest.join("d")).unwrap();
    fs::write(dest.join("d/a.txt"), "old").unwrap();

    // 確認 (overwrite) が無ければ, 何も変えずに失敗する.
    let (result, _) = run(&request(TransferKind::Move, &[&src], Some(&dest)));

    assert!(result.unwrap_err().starts_with("Already exists"));
    assert_eq!(fs::read_to_string(src.join("a.txt")).unwrap(), "new");
    assert_eq!(fs::read_to_string(dest.join("d/a.txt")).unwrap(), "old");
}

#[test]
fn test_transfer_move_multiple_with_one_conflict_changes_nothing() {
    let dir = tempdir().unwrap();
    let a = dir.path().join("a.txt");
    let b = dir.path().join("b.txt");
    fs::write(&a, "a").unwrap();
    fs::write(&b, "b").unwrap();
    let dest = dir.path().join("dest");
    fs::create_dir(&dest).unwrap();
    fs::write(dest.join("b.txt"), "old-b").unwrap();

    let (result, _) = run(&request(TransferKind::Move, &[&a, &b], Some(&dest)));

    // 一部だけが同名でも, 確認が無ければ全体を実行しない (a.txt も移さない).
    assert!(result.is_err());
    assert!(a.exists() && b.exists());
    assert!(!dest.join("a.txt").exists());
    assert_eq!(fs::read_to_string(dest.join("b.txt")).unwrap(), "old-b");
}

#[test]
fn test_move_one_never_overwrites_without_the_overwrite_flag() {
    // 検証の後に同名のものができた場合に備え, move_one 自身も, 黙って上書きしない.
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    let dst = dir.path().join("b.txt");
    let src_dir = dir.path().join("sd");
    let dst_dir = dir.path().join("dd");
    fs::write(&src, "new").unwrap();
    fs::write(&dst, "old").unwrap();
    fs::create_dir(&src_dir).unwrap();
    fs::create_dir(&dst_dir).unwrap();
    let cancel = AtomicBool::new(false);
    let skip = HashSet::new();
    let mut progress = Progress {
        cancel: &cancel,
        skip: &skip,
        on_progress: &mut |_| {},
        done: 0,
        total: 0,
        last_sent: None,
    };

    let file = move_one(&src, &dst, false, &|a, b| fs::rename(a, b), &mut progress);
    let directory = move_one(
        &src_dir,
        &dst_dir,
        false,
        &|a, b| fs::rename(a, b),
        &mut progress,
    );

    assert!(matches!(file, Err(Stop::Failed(m)) if m.starts_with("Already exists")));
    assert!(matches!(directory, Err(Stop::Failed(m)) if m.starts_with("Already exists")));
    assert_eq!(fs::read_to_string(&src).unwrap(), "new");
    assert_eq!(fs::read_to_string(&dst).unwrap(), "old");
    assert!(src_dir.is_dir() && dst_dir.is_dir());
}

#[test]
fn test_transfer_move_merge_stops_when_a_child_conflicts_with_a_directory() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("d");
    fs::create_dir(&src).unwrap();
    fs::write(src.join("x"), "file").unwrap();
    let dest = dir.path().join("dest");
    fs::create_dir_all(dest.join("d/x")).unwrap();

    let mut req = request(TransferKind::Move, &[&src], Some(&dest));
    req.overwrite = true;
    let (result, _) = run(&req);

    // 中身のファイルを, 同名のディレクトリへ上書きしない. 移動元はそのまま残る.
    assert!(result.unwrap_err().contains("already exists"));
    assert!(src.join("x").is_file());
    assert!(dest.join("d/x").is_dir());
}

#[test]
fn test_transfer_move_merge_can_be_cancelled() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("d");
    fs::create_dir(&src).unwrap();
    fs::write(src.join("a.txt"), "a").unwrap();
    let dest = dir.path().join("dest");
    fs::create_dir_all(dest.join("d")).unwrap();
    let cancel = AtomicBool::new(true);
    let skip = HashSet::new();
    let mut progress = Progress {
        cancel: &cancel,
        skip: &skip,
        on_progress: &mut |_| {},
        done: 0,
        total: 0,
        last_sent: None,
    };

    let result = merge_directory(
        &src,
        &dest.join("d"),
        true,
        &|a, b| fs::rename(a, b),
        &mut progress,
    );

    assert!(matches!(result, Err(Stop::Cancelled)));
    assert!(src.join("a.txt").exists());
    assert!(!dest.join("d/a.txt").exists());
}

/// 同名のディレクトリ `d` を持つ 2 つの場所を作る. 同名のファイルは `a.txt` と `sub/b.txt`.
fn nested_fixture(root: &Path) -> (PathBuf, PathBuf) {
    let src = root.join("d");
    fs::create_dir_all(src.join("sub")).unwrap();
    fs::write(src.join("a.txt"), "new-a").unwrap();
    fs::write(src.join("only_src.txt"), "only").unwrap();
    fs::write(src.join("sub/b.txt"), "new-b").unwrap();
    let dest = root.join("dest");
    fs::create_dir_all(dest.join("d/sub")).unwrap();
    fs::write(dest.join("d/a.txt"), "old-a").unwrap();
    fs::write(dest.join("d/sub/b.txt"), "old-b").unwrap();
    fs::write(dest.join("d/keep.txt"), "keep").unwrap();
    (src, dest)
}

#[test]
fn test_find_nested_conflicts_lists_same_named_files_in_order() {
    let dir = tempdir().unwrap();
    let (src, dest) = nested_fixture(dir.path());

    let found = find_nested_conflicts(
        &[src.to_string_lossy().into_owned()],
        &dest.to_string_lossy(),
    )
    .unwrap();

    // 同名のファイルだけ (only_src.txt と keep.txt は含まない). 名前順で, 表示名は対象の名前から始まる.
    assert_eq!(
        found.iter().map(|c| c.label.as_str()).collect::<Vec<_>>(),
        vec!["d/a.txt", "d/sub/b.txt"]
    );
    assert_eq!(found[0].source, src.join("a.txt").to_string_lossy());
    assert_eq!(found[1].source, src.join("sub/b.txt").to_string_lossy());
}

#[test]
fn test_find_nested_conflicts_ignores_non_merging_cases() {
    let dir = tempdir().unwrap();
    let (src, dest) = nested_fixture(dir.path());
    // 移動先に同名のディレクトリが無い対象, ファイルの対象, 種類が違う組み合わせは, 数えない.
    let lone = dir.path().join("lone");
    fs::create_dir(&lone).unwrap();
    fs::write(lone.join("x.txt"), "x").unwrap();
    let plain = dir.path().join("a.txt");
    fs::write(&plain, "plain").unwrap();
    fs::write(dest.join("a.txt"), "dest-plain").unwrap();
    fs::create_dir(dest.join("d/dirvsfile")).unwrap();
    fs::write(src.join("dirvsfile"), "f").unwrap();
    fs::write(dest.join("d/filevsdir"), "f").unwrap();
    fs::create_dir(src.join("filevsdir")).unwrap();

    let sources: Vec<String> = [&lone, &plain, &src]
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    let found = find_nested_conflicts(&sources, &dest.to_string_lossy()).unwrap();

    assert_eq!(
        found.iter().map(|c| c.label.as_str()).collect::<Vec<_>>(),
        vec!["d/a.txt", "d/sub/b.txt"]
    );
    assert!(find_nested_conflicts(&["/".to_string()], &dest.to_string_lossy()).is_err());
    assert!(check_nested_conflicts(
        vec![src.to_string_lossy().into_owned()],
        dest.to_string_lossy().into_owned()
    )
    .is_ok());
}

#[test]
fn test_transfer_move_merge_skips_files_answered_no_and_keeps_them() {
    let dir = tempdir().unwrap();
    let (src, dest) = nested_fixture(dir.path());

    let mut req = request(TransferKind::Move, &[&src], Some(&dest));
    req.overwrite = true;
    req.skip = vec![src.join("a.txt").to_string_lossy().into_owned()];
    let (result, events) = run(&req);

    assert_eq!(result.unwrap().processed, 1);
    // 「いいえ」のファイルは上書きせず, 移動元に残る. 他は上書きされて移る.
    assert_eq!(fs::read_to_string(dest.join("d/a.txt")).unwrap(), "old-a");
    assert_eq!(fs::read_to_string(src.join("a.txt")).unwrap(), "new-a");
    assert_eq!(
        fs::read_to_string(dest.join("d/sub/b.txt")).unwrap(),
        "new-b"
    );
    assert_eq!(
        fs::read_to_string(dest.join("d/only_src.txt")).unwrap(),
        "only"
    );
    // 移動元には, 残ったファイルがあるので, ディレクトリは消えない. 空になった sub は消える.
    assert!(src.is_dir());
    assert!(!src.join("sub").exists());
    assert!(!src.join("only_src.txt").exists());
    assert_eq!(events.last().unwrap().done, events.last().unwrap().total);
}

#[test]
fn test_transfer_copy_merge_skips_files_answered_no() {
    let dir = tempdir().unwrap();
    let (src, dest) = nested_fixture(dir.path());

    let mut req = request(TransferKind::Copy, &[&src], Some(&dest));
    req.overwrite = true;
    req.skip = vec![src.join("sub/b.txt").to_string_lossy().into_owned()];
    let (result, events) = run(&req);

    assert!(result.is_ok());
    assert_eq!(fs::read_to_string(dest.join("d/a.txt")).unwrap(), "new-a");
    assert_eq!(
        fs::read_to_string(dest.join("d/sub/b.txt")).unwrap(),
        "old-b"
    );
    assert_eq!(
        fs::read_to_string(dest.join("d/only_src.txt")).unwrap(),
        "only"
    );
    // コピーでは, 移動元はそのまま.
    assert!(src.join("a.txt").exists() && src.join("sub/b.txt").exists());
    assert_eq!(events.last().unwrap().done, events.last().unwrap().total);
}

#[test]
fn test_transfer_delete_permanent_success() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("f");
    let sub = dir.path().join("d");
    fs::create_dir_all(sub.join("x")).unwrap();
    fs::write(&file, "x").unwrap();

    let (result, events) = run(&request(TransferKind::Delete, &[&file, &sub], None));

    assert_eq!(result.unwrap().processed, 2);
    assert!(!file.exists() && !sub.exists());
    assert_eq!(
        (events.last().unwrap().done, events.last().unwrap().total),
        (2, 2)
    );
}

#[test]
fn test_transfer_delete_trash_uses_trasher() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("f");
    fs::write(&file, "x").unwrap();
    let mut req = request(TransferKind::Delete, &[&file], None);
    req.permanent = false;
    let cancel = AtomicBool::new(false);
    let called = RefCell::new(Vec::new());

    let result = transfer_with(
        &req,
        &cancel,
        &|a, b| fs::rename(a, b),
        &|p| {
            called.borrow_mut().push(p.to_path_buf());
            Ok(())
        },
        &mut |_| {},
    );
    assert!(result.is_ok());
    assert_eq!(called.into_inner(), vec![file.clone()]);
    assert!(file.exists());

    let failed = transfer_with(
        &req,
        &cancel,
        &|a, b| fs::rename(a, b),
        &|_| Err("trash failed".to_string()),
        &mut |_| {},
    );
    assert_eq!(failed.unwrap_err(), "trash failed");
}

#[test]
fn test_transfer_delete_missing_failure() {
    let dir = tempdir().unwrap();
    let missing = dir.path().join("missing");
    let (result, _) = run(&request(TransferKind::Delete, &[&missing], None));
    assert!(result.unwrap_err().starts_with("Path does not exist"));
}

#[test]
fn test_transfer_cancel_before_start() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("f");
    fs::write(&file, "x").unwrap();
    let cancel = AtomicBool::new(true);

    let result = transfer(
        &request(TransferKind::Delete, &[&file], None),
        &cancel,
        &mut |_| {},
    );

    assert_eq!(
        result.unwrap(),
        TransferSummary {
            processed: 0,
            cancelled: true
        }
    );
    assert!(file.exists());
}

#[test]
fn test_transfer_cancel_during_copy_removes_partial_file() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("big.bin");
    fs::write(&src, vec![7u8; CHUNK_SIZE * 2 + 10]).unwrap();
    let dest = dir.path().join("dest");
    fs::create_dir(&dest).unwrap();
    let cancel = AtomicBool::new(false);

    let result = transfer(
        &request(TransferKind::Copy, &[&src], Some(&dest)),
        &cancel,
        &mut |_| cancel.store(true, Ordering::SeqCst),
    );

    assert_eq!(
        result.unwrap(),
        TransferSummary {
            processed: 0,
            cancelled: true
        }
    );
    assert!(!dest.join("big.bin").exists());
    assert!(src.exists());
}

#[test]
fn test_find_conflicts_success() {
    let dir = tempdir().unwrap();
    let dest = dir.path().join("dest");
    fs::create_dir(&dest).unwrap();
    fs::write(dest.join("a"), "").unwrap();
    let sources = vec!["/x/a".to_string(), "/x/b".to_string()];

    assert_eq!(
        find_conflicts(&sources, dest.to_str().unwrap(), None).unwrap(),
        vec!["a".to_string()]
    );
    assert_eq!(
        check_conflicts(sources, dest.to_string_lossy().into_owned(), None).unwrap(),
        vec!["a".to_string()]
    );
    assert!(find_conflicts(&["/".to_string()], "/tmp", None).is_err());
}

/// 更新日時を, 基準から `secs` 秒ずらした時刻に設定する (負なら過去).
fn set_mtime(path: &Path, secs: i64) {
    let base = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000);
    let time = if secs >= 0 {
        base + std::time::Duration::from_secs(secs.unsigned_abs())
    } else {
        base - std::time::Duration::from_secs(secs.unsigned_abs())
    };
    fs::File::options()
        .write(true)
        .open(path)
        .unwrap()
        .set_modified(time)
        .unwrap();
}

#[test]
fn test_find_stale_overwrites_lists_only_newer_destinations() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("src");
    let dest = dir.path().join("dest");
    fs::create_dir(&src).unwrap();
    fs::create_dir(&dest).unwrap();
    for name in ["new_dest", "old_dest", "same", "only_src"] {
        fs::write(src.join(name), "s").unwrap();
    }
    for name in ["new_dest", "old_dest", "same"] {
        fs::write(dest.join(name), "d").unwrap();
    }
    set_mtime(&src.join("new_dest"), 0);
    set_mtime(&dest.join("new_dest"), 100);
    set_mtime(&src.join("old_dest"), 100);
    set_mtime(&dest.join("old_dest"), 0);
    set_mtime(&src.join("same"), 50);
    set_mtime(&dest.join("same"), 50);
    let sources: Vec<String> = ["new_dest", "old_dest", "same", "only_src"]
        .iter()
        .map(|n| src.join(n).to_string_lossy().into_owned())
        .collect();

    // 配置先のほうが新しいものだけ (同じ日時と, 配置先にないものは含まない).
    let expected = vec!["new_dest".to_string()];
    assert_eq!(
        find_stale_overwrites(&sources, dest.to_str().unwrap(), None).unwrap(),
        expected
    );
    assert_eq!(
        check_stale_overwrites(sources, dest.to_string_lossy().into_owned(), None).unwrap(),
        expected
    );
    assert!(find_stale_overwrites(&["/".to_string()], "/tmp", None).is_err());
}

#[test]
fn test_find_stale_overwrites_uses_the_new_name_and_ignores_directories() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    let dest = dir.path().join("dest");
    fs::create_dir(&dest).unwrap();
    fs::write(&src, "s").unwrap();
    fs::write(dest.join("b.txt"), "d").unwrap();
    set_mtime(&src, 0);
    set_mtime(&dest.join("b.txt"), 10);
    let sources = vec![src.to_string_lossy().into_owned()];

    // 名前を付けてコピーするときは, その名前の配置先と比べる.
    assert_eq!(
        find_stale_overwrites(&sources, dest.to_str().unwrap(), Some("b.txt")).unwrap(),
        vec!["b.txt".to_string()]
    );
    // ディレクトリ同士 (統合) は, ここでは数えない.
    let folder = dir.path().join("f");
    fs::create_dir(&folder).unwrap();
    fs::create_dir(dest.join("f")).unwrap();
    assert!(find_stale_overwrites(
        &[folder.to_string_lossy().into_owned()],
        dest.to_str().unwrap(),
        None
    )
    .unwrap()
    .is_empty());
}

#[test]
fn test_find_nested_conflicts_marks_the_newer_destination_as_stale() {
    let dir = tempdir().unwrap();
    let (src, dest) = nested_fixture(dir.path());
    set_mtime(&src.join("a.txt"), 0);
    set_mtime(&dest.join("d/a.txt"), 100);
    set_mtime(&src.join("sub/b.txt"), 100);
    set_mtime(&dest.join("d/sub/b.txt"), 0);

    let found = find_nested_conflicts(
        &[src.to_string_lossy().into_owned()],
        &dest.to_string_lossy(),
    )
    .unwrap();

    assert_eq!(
        found.iter().map(|c| c.stale).collect::<Vec<_>>(),
        vec![true, false]
    );
}

#[test]
fn test_transfer_copy_same_directory_rename_success() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    fs::write(&src, "hello").unwrap();

    let mut req = request(TransferKind::Copy, &[&src], Some(dir.path()));
    req.dest_name = Some("b.txt".to_string());
    let (result, events) = run(&req);

    assert_eq!(
        result.unwrap(),
        TransferSummary {
            processed: 1,
            cancelled: false
        }
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("b.txt")).unwrap(),
        "hello"
    );
    assert!(src.exists());
    assert_eq!(events.last().unwrap().current, "a.txt");
}

#[test]
fn test_transfer_copy_same_directory_rename_conflict() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    let existing = dir.path().join("b.txt");
    fs::write(&src, "hello").unwrap();
    fs::write(&existing, "existing").unwrap();

    let mut req = request(TransferKind::Copy, &[&src], Some(dir.path()));
    req.dest_name = Some("b.txt".to_string());
    let (result, _) = run(&req);

    assert!(result.unwrap_err().starts_with("Already exists"));
}

#[test]
fn test_transfer_copy_dest_name_requires_single_source() {
    let dir = tempdir().unwrap();
    let src1 = dir.path().join("a.txt");
    let src2 = dir.path().join("b.txt");
    fs::write(&src1, "1").unwrap();
    fs::write(&src2, "2").unwrap();

    let mut req = request(TransferKind::Copy, &[&src1, &src2], Some(dir.path()));
    req.dest_name = Some("c.txt".to_string());
    let (result, _) = run(&req);

    assert_eq!(
        result.unwrap_err(),
        "dest_name requires exactly one source file"
    );
}

#[test]
fn test_transfer_move_dest_name_not_allowed() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    let dest = dir.path().join("dest");
    fs::write(&src, "hello").unwrap();
    fs::create_dir(&dest).unwrap();

    let mut req = request(TransferKind::Move, &[&src], Some(&dest));
    req.dest_name = Some("b.txt".to_string());
    let (result, _) = run(&req);

    assert_eq!(result.unwrap_err(), "dest_name is only allowed for Copy");
}

#[test]
fn test_transfer_copy_dest_name_invalid_name() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    fs::write(&src, "hello").unwrap();

    let mut req = request(TransferKind::Copy, &[&src], Some(dir.path()));
    req.dest_name = Some("..".to_string());
    let (result, _) = run(&req);

    assert!(result.unwrap_err().starts_with("Invalid name"));
}

#[test]
fn test_transfer_state_begin_and_cancel() {
    let state = TransferState::default();
    let flag = state.begin();
    assert!(!flag.load(Ordering::SeqCst));
    state.cancel();
    assert!(flag.load(Ordering::SeqCst));
    assert!(!state.begin().load(Ordering::SeqCst));
}

#[test]
fn test_tree_size_missing_is_zero() {
    let dir = tempdir().unwrap();
    assert_eq!(tree_size(&dir.path().join("none")), 0);
}

#[test]
fn test_copy_file_io_error_failure() {
    let dir = tempdir().unwrap();
    let cancel = AtomicBool::new(false);
    let skip = HashSet::new();
    let mut progress = Progress {
        cancel: &cancel,
        skip: &skip,
        on_progress: &mut |_| {},
        done: 0,
        total: 0,
        last_sent: None,
    };

    let result = copy_file(
        &dir.path().join("none"),
        &dir.path().join("dst"),
        false,
        &mut progress,
    );

    assert!(matches!(result, Err(Stop::Failed(m)) if !m.is_empty()));
}

#[cfg(unix)]
#[test]
fn test_transfer_dangling_symlink_copy_and_move_success() {
    // リンク先の無いシンボリックリンクも, リンクそのものをコピー・移動できる.
    let dir = tempdir().unwrap();
    let link = dir.path().join("broken");
    std::os::unix::fs::symlink(dir.path().join("missing"), &link).unwrap();
    let copy_dest = dir.path().join("copy");
    let move_dest = dir.path().join("move");
    fs::create_dir(&copy_dest).unwrap();
    fs::create_dir(&move_dest).unwrap();

    let (copied, _) = run(&request(TransferKind::Copy, &[&link], Some(&copy_dest)));
    assert_eq!(copied.unwrap().processed, 1);
    assert_eq!(
        fs::read_link(copy_dest.join("broken")).unwrap(),
        dir.path().join("missing")
    );

    let (moved, _) = run(&request(TransferKind::Move, &[&link], Some(&move_dest)));
    assert_eq!(moved.unwrap().processed, 1);
    assert!(fs::symlink_metadata(&link).is_err());
    assert!(move_dest.join("broken").is_symlink());
}

#[cfg(unix)]
#[test]
fn test_plan_placements_symlink_checks_link_itself() {
    // リンクを, リンク先のディレクトリの中へ置ける (リンク先の親と比べない).
    let dir = tempdir().unwrap();
    let target = dir.path().join("target");
    let links = dir.path().join("links");
    fs::create_dir(&target).unwrap();
    fs::create_dir(&links).unwrap();
    let link = links.join("to_target");
    std::os::unix::fs::symlink(&target, &link).unwrap();

    let plan = plan_placements(&request(TransferKind::Copy, &[&link], Some(&target))).unwrap();
    assert_eq!(plan, vec![(link.clone(), target.join("to_target"))]);

    // リンクと同じディレクトリへの配置は, 拒否する.
    let same = plan_placements(&request(TransferKind::Copy, &[&link], Some(&links)));
    assert!(same
        .unwrap_err()
        .starts_with("Source and destination are the same"));
}

#[test]
fn test_canonical_entry_success_and_failure() {
    let dir = tempdir().unwrap();
    let canonical_dir = fs::canonicalize(dir.path()).unwrap();
    // 名前の無いパス (ルート) は, そのまま正規化する.
    let root = std::path::absolute("/").unwrap();
    assert_eq!(
        canonical_entry(&root).unwrap(),
        fs::canonicalize(&root).unwrap()
    );
    // 親だけを正規化するので, 対象が無くても求められる.
    assert_eq!(
        canonical_entry(&dir.path().join("none")).unwrap(),
        canonical_dir.join("none")
    );
    // 親が無い場合は失敗する.
    assert!(canonical_entry(&dir.path().join("none").join("x")).is_err());
}

#[cfg(unix)]
#[test]
fn test_tree_size_with_cyclic_symlink() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("a.txt");
    fs::write(&file, "hello").unwrap();
    // 循環シンボリックリンク loop -> .
    let loop_link = dir.path().join("loop");
    std::os::unix::fs::symlink(dir.path(), &loop_link).unwrap();

    // 循環リンクがあっても無限ループ・スタックオーバーフローせず計算できる
    let size = tree_size(dir.path());
    assert!(size >= 5);
}

#[cfg(unix)]
#[test]
fn test_copy_tree_with_cyclic_symlink() {
    let dir = tempdir().unwrap();
    let src_dir = dir.path().join("src");
    let dst_dir = dir.path().join("dst");
    fs::create_dir(&src_dir).unwrap();
    fs::write(src_dir.join("f.txt"), "data").unwrap();
    // 循環シンボリックリンク
    std::os::unix::fs::symlink(&src_dir, src_dir.join("loop")).unwrap();

    let cancel = AtomicBool::new(false);
    let skip = HashSet::new();
    let mut progress = Progress {
        cancel: &cancel,
        skip: &skip,
        on_progress: &mut |_| {},
        done: 0,
        total: 0,
        last_sent: None,
    };

    // 循環リンクがあっても無限ループにならず, コピーが成功すること
    let result = copy_tree(&src_dir, &dst_dir, false, &mut progress);
    assert!(result.is_ok());
    assert!(dst_dir.join("f.txt").is_file());
    assert!(dst_dir.join("loop").is_symlink());
}

#[cfg(unix)]
#[test]
fn test_copy_tree_symlink_overwrites_existing_file() {
    let dir = tempdir().unwrap();
    let target = dir.path().join("target.txt");
    fs::write(&target, "content").unwrap();
    let src_link = dir.path().join("src_link");
    std::os::unix::fs::symlink(&target, &src_link).unwrap();

    let dst_link = dir.path().join("dst_link");
    fs::write(&dst_link, "old content").unwrap();

    let cancel = AtomicBool::new(false);
    let skip = HashSet::new();
    let mut progress = Progress {
        cancel: &cancel,
        skip: &skip,
        on_progress: &mut |_| {},
        done: 0,
        total: 0,
        last_sent: None,
    };

    let result = copy_tree(&src_link, &dst_link, true, &mut progress);
    assert!(result.is_ok());
    assert!(dst_link.is_symlink());
}

#[cfg(unix)]
#[test]
fn test_copy_tree_symlink_onto_directory_failure() {
    let dir = tempdir().unwrap();
    let target = dir.path().join("target.txt");
    fs::write(&target, "content").unwrap();
    let src_link = dir.path().join("src_link");
    std::os::unix::fs::symlink(&target, &src_link).unwrap();
    let dst_dir = dir.path().join("dst");
    fs::create_dir(&dst_dir).unwrap();
    fs::write(dst_dir.join("keep.txt"), "keep").unwrap();

    let cancel = AtomicBool::new(false);
    let skip = HashSet::new();
    let mut progress = Progress {
        cancel: &cancel,
        skip: &skip,
        on_progress: &mut |_| {},
        done: 0,
        total: 0,
        last_sent: None,
    };

    // ディレクトリをリンクで置き換えず, 中身を残すこと
    let result = copy_tree(&src_link, &dst_dir, true, &mut progress);
    assert!(
        matches!(result, Err(Stop::Failed(m)) if m.starts_with("Destination directory already exists"))
    );
    assert_eq!(
        fs::read_to_string(dst_dir.join("keep.txt")).unwrap(),
        "keep"
    );
}

#[cfg(unix)]
#[test]
fn test_move_one_directory_symlink_preserves_real_target() {
    let dir = tempdir().unwrap();
    let real_dir = dir.path().join("real");
    fs::create_dir(&real_dir).unwrap();
    let important_file = real_dir.join("important.txt");
    fs::write(&important_file, "vital data").unwrap();

    let link_dir = dir.path().join("link");
    std::os::unix::fs::symlink(&real_dir, &link_dir).unwrap();
    let dest = dir.path().join("moved_link");

    let cancel = AtomicBool::new(false);
    let skip = HashSet::new();
    let mut progress = Progress {
        cancel: &cancel,
        skip: &skip,
        on_progress: &mut |_| {},
        done: 0,
        total: 0,
        last_sent: None,
    };

    // rename が失敗する (異ディスク移動) ケースをシミュレート
    let result = move_one(
        &link_dir,
        &dest,
        false,
        &|_, _| {
            Err(std::io::Error::new(
                std::io::ErrorKind::CrossesDevices,
                "cross device",
            ))
        },
        &mut progress,
    );

    assert!(result.is_ok());
    // 元のシンボリックリンクは移動元から消え, 移動先にシンボリックリンクとして存在する
    assert!(!link_dir.exists());
    assert!(dest.is_symlink());
    // 実体ディレクトリとその中のファイルは絶対に削除されていないこと (データ損失防止)
    assert!(real_dir.is_dir());
    assert!(important_file.is_file());
    assert_eq!(fs::read_to_string(&important_file).unwrap(), "vital data");
}

#[test]
fn test_copy_file_keeps_mtime_and_replaces_through_a_temp_file() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    fs::write(&src, "new").unwrap();
    set_mtime(&src, -3600);
    let dest = dir.path().join("dest");
    fs::create_dir(&dest).unwrap();
    fs::write(dest.join("a.txt"), "old").unwrap();
    let mut req = request(TransferKind::Copy, &[&src], Some(&dest));
    req.overwrite = true;

    run(&req).0.unwrap();

    assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "new");
    assert_eq!(
        fs::metadata(dest.join("a.txt"))
            .unwrap()
            .modified()
            .unwrap(),
        fs::metadata(&src).unwrap().modified().unwrap()
    );
    // 一時ファイルは残らない.
    assert_eq!(fs::read_dir(&dest).unwrap().count(), 1);
}

#[test]
fn test_copy_file_overwrite_does_not_change_hard_linked_file() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    fs::write(&src, "new").unwrap();
    let dest = dir.path().join("dest");
    fs::create_dir(&dest).unwrap();
    let other = dir.path().join("other.txt");
    fs::write(&other, "keep").unwrap();
    fs::hard_link(&other, dest.join("a.txt")).unwrap();
    let mut req = request(TransferKind::Copy, &[&src], Some(&dest));
    req.overwrite = true;

    run(&req).0.unwrap();

    assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "new");
    assert_eq!(fs::read_to_string(&other).unwrap(), "keep");
}

#[test]
fn test_copy_file_cancel_keeps_existing_destination() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("big.bin");
    fs::write(&src, vec![7u8; CHUNK_SIZE * 2 + 10]).unwrap();
    let dest = dir.path().join("dest");
    fs::create_dir(&dest).unwrap();
    fs::write(dest.join("big.bin"), "old").unwrap();
    let cancel = AtomicBool::new(false);
    let mut req = request(TransferKind::Copy, &[&src], Some(&dest));
    req.overwrite = true;

    let result = transfer(&req, &cancel, &mut |_| cancel.store(true, Ordering::SeqCst));

    assert!(result.unwrap().cancelled);
    assert_eq!(fs::read_to_string(dest.join("big.bin")).unwrap(), "old");
    assert_eq!(fs::read_dir(&dest).unwrap().count(), 1);
}

#[test]
fn test_copy_file_replace_failure_removes_temp_file() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    fs::write(&src, "x").unwrap();
    // 中身のあるディレクトリには, ファイルの名前を変えて置き換えられない.
    let dst = dir.path().join("busy");
    fs::create_dir(&dst).unwrap();
    fs::write(dst.join("child"), "").unwrap();
    let cancel = AtomicBool::new(false);
    let skip = HashSet::new();
    let mut progress = Progress {
        cancel: &cancel,
        skip: &skip,
        on_progress: &mut |_| {},
        done: 0,
        total: 0,
        last_sent: None,
    };

    let result = copy_file(&src, &dst, true, &mut progress);

    assert!(matches!(result, Err(Stop::Failed(_))));
    assert!(!temp_path_of(&dst).exists());
}

#[test]
fn test_move_one_refuses_destination_created_after_the_check() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    fs::write(&src, "x").unwrap();
    let dst = dir.path().join("b.txt");
    let cancel = AtomicBool::new(false);
    let skip = HashSet::new();
    let mut progress = Progress {
        cancel: &cancel,
        skip: &skip,
        on_progress: &mut |_| {},
        done: 0,
        total: 0,
        last_sent: None,
    };

    // 名前を変える直前に, 別のプロセスが同名のファイルを作った.
    let result = move_one(
        &src,
        &dst,
        false,
        &|_, b| {
            fs::write(b, "other")?;
            rename_noreplace(&src, b)
        },
        &mut progress,
    );

    assert!(matches!(result, Err(Stop::Failed(m)) if m.starts_with("Already exists")));
    assert_eq!(fs::read_to_string(&dst).unwrap(), "other");
    assert!(src.exists());
}

/// テスト用の進捗の窓口を作り, `f` に渡す.
fn with_progress<R>(f: impl FnOnce(&mut Progress) -> R) -> R {
    let cancel = AtomicBool::new(false);
    let skip = HashSet::new();
    let mut progress = Progress {
        cancel: &cancel,
        skip: &skip,
        on_progress: &mut |_| {},
        done: 0,
        total: 0,
        last_sent: None,
    };
    f(&mut progress)
}

#[test]
fn test_copy_file_without_overwrite_keeps_destination_created_after_the_check() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("a.txt");
    fs::write(&src, "new").unwrap();
    // 確認の後に, 別のプロセスが同名のファイルを作った.
    let dst = dir.path().join("b.txt");
    fs::write(&dst, "other").unwrap();

    let result = with_progress(|p| copy_file(&src, &dst, false, p));

    assert!(matches!(result, Err(Stop::Failed(m)) if m.starts_with("Already exists")));
    assert_eq!(fs::read_to_string(&dst).unwrap(), "other");
    assert!(!temp_path_of(&dst).exists());
}

#[test]
fn test_place_temp_without_overwrite_reports_other_errors() {
    let dir = tempdir().unwrap();
    let temp = dir.path().join("temp");
    fs::write(&temp, "x").unwrap();

    // 置く先のディレクトリが無い.
    let result = place_temp(&temp, &dir.path().join("none").join("a.txt"), false);

    assert!(matches!(result, Err(Stop::Failed(m)) if !m.starts_with("Already exists")));
}

#[cfg(unix)]
#[test]
fn test_copy_tree_symlink_without_overwrite_keeps_existing_entry() {
    let dir = tempdir().unwrap();
    let src_link = dir.path().join("link");
    std::os::unix::fs::symlink("target", &src_link).unwrap();
    let dst = dir.path().join("dst");
    fs::write(&dst, "keep").unwrap();

    let result = with_progress(|p| copy_tree(&src_link, &dst, false, p));

    assert!(matches!(result, Err(Stop::Failed(m)) if m.starts_with("Already exists")));
    assert_eq!(fs::read_to_string(&dst).unwrap(), "keep");
}
