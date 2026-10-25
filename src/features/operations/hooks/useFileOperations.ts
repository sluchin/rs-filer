import { useCallback, useState } from "react";
import loglevel from "loglevel";
import {
  createDirectory,
  createFile,
  openInEditor,
  openItem,
  renameItem,
} from "../../../services/tauriApi";
import type { PaneDeps } from "../../explorer/hooks/useFileList";
import type { FileEntry } from "../../explorer/types";
import type { ChoiceOption, DialogState } from "../types";

/** この機能のロガー. */
const log = loglevel.getLogger("operations");

/**
 * ファイル操作 (作成・名前変更・外部アプリやエディタで開く) と, その入力・確認のダイアログ状態を扱うフック.
 *
 * @param deps - ペインの状態と操作.
 * @returns 表示中のダイアログと, 各操作を開始するハンドラー.
 */
export function useFileOperations({
  activePane,
  leftPane,
  rightPane,
  loadDirectory,
  setError,
}: PaneDeps) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  /** ダイアログを閉じます. */
  const closeDialog = useCallback((): void => setDialog(null), []);

  /**
   * 文字列を 1 つ入力させるダイアログを開きます.
   *
   * @param title - ダイアログの見出し.
   * @param onSubmit - 入力を確定したときの処理.
   * @param initialValue - 入力欄の初期値.
   */
  const openPrompt = useCallback(
    (
      title: string,
      onSubmit: (value: string) => void,
      initialValue?: string,
    ): void => {
      setDialog({
        kind: "prompt",
        title,
        initialValue: initialValue ?? "",
        onSubmit: (value) => {
          setDialog(null);
          onSubmit(value);
        },
      });
    },
    [],
  );

  /**
   * はい/いいえで確認するダイアログを開きます.
   *
   * @param title - ダイアログの見出し.
   * @param message - 確認する内容.
   * @param onConfirm - 承諾したときの処理.
   */
  const openConfirm = useCallback(
    (title: string, message: string, onConfirm: () => void): void => {
      setDialog({
        kind: "confirm",
        title,
        message,
        onConfirm: () => {
          setDialog(null);
          onConfirm();
        },
      });
    },
    [],
  );

  /**
   * 複数の選択肢から 1 つをキーで選ぶダイアログを開きます. 選ぶと, ダイアログを閉じてから, その処理を実行します.
   *
   * @param title - ダイアログの見出し.
   * @param message - 確認する内容.
   * @param choices - 選択肢.
   */
  const openChoice = useCallback(
    (title: string, message: string, choices: ChoiceOption[]): void => {
      setDialog({
        kind: "choice",
        title,
        message,
        choices: choices.map((choice) => ({
          ...choice,
          run: () => {
            setDialog(null);
            choice.run();
          },
        })),
      });
    },
    [],
  );

  /**
   * 操作を実行し, 失敗した場合はエラーを表示します.
   *
   * @param label - ログに出す操作名.
   * @param action - 実行する処理.
   */
  const attempt = useCallback(
    async (label: string, action: () => Promise<void>): Promise<void> => {
      try {
        setError(null);
        await action();
        log.info(`${label} 完了`);
      } catch (e) {
        log.error(`${label} 失敗:`, e);
        setError(String(e));
      }
    },
    [setError],
  );

  /**
   * アクティブなペインのカーソル位置の項目を返します. 無い場合はエラーを表示して undefined を返します.
   */
  const selectedEntry = useCallback((): FileEntry | undefined => {
    const state = activePane === "left" ? leftPane : rightPane;
    const file = state.files[state.selectedIndex];
    if (!file) {
      setError("対象の項目が選択されていません.");
    }
    return file;
  }, [activePane, leftPane, rightPane, setError]);

  /**
   * 名前を入力させ, アクティブなペインのカレントディレクトリに作成します.
   *
   * @param title - ダイアログの見出し.
   * @param create - 作成を実行する関数.
   */
  const startCreate = useCallback(
    (
      title: string,
      create: (parent: string, name: string) => Promise<void>,
    ): void => {
      const pane = activePane;
      const parent = (pane === "left" ? leftPane : rightPane).currentPath;
      setDialog({
        kind: "prompt",
        title,
        initialValue: "",
        onSubmit: (name) => {
          setDialog(null);
          attempt(title, async () => {
            await create(parent, name);
            await loadDirectory(pane, parent, { selectName: name.trim() });
          });
        },
      });
    },
    [activePane, leftPane, rightPane, attempt, loadDirectory],
  );

  /** 新しいディレクトリの名前を入力させて作成します. */
  const startMkdir = useCallback(
    (): void => startCreate("新規ディレクトリ作成", createDirectory),
    [startCreate],
  );

  /**
   * 新しいディレクトリの名前を入力させて, 指定したディレクトリの下に作成します (ツリー表示用).
   * 作成したら, アクティブなペインの一覧も読み込み直し, 呼び出し側 (ツリー) へ作成した名前を知らせます.
   *
   * @param parent - 作成先のディレクトリの絶対パス.
   * @param onCreated - 作成できたときに呼ぶ関数 (作成したディレクトリの名前が渡される).
   */
  const startMkdirAt = useCallback(
    (parent: string, onCreated: (name: string) => void): void => {
      const pane = activePane;
      const listPath = (pane === "left" ? leftPane : rightPane).currentPath;
      const title = "新規ディレクトリ作成";
      setDialog({
        kind: "prompt",
        title,
        initialValue: "",
        onSubmit: (name) => {
          setDialog(null);
          attempt(title, async () => {
            await createDirectory(parent, name);
            // ツリーを閉じたときに, 一覧にも反映されているようにする.
            await loadDirectory(pane, listPath, { keepCursor: true });
            onCreated(name.trim());
          });
        },
      });
    },
    [activePane, leftPane, rightPane, attempt, loadDirectory],
  );

  /** 新しい空ファイルの名前を入力させて作成します. */
  const startTouch = useCallback(
    (): void => startCreate("新規ファイル作成", createFile),
    [startCreate],
  );

  /** カーソル位置の項目の新しい名前を入力させて変更します. */
  const startRename = useCallback((): void => {
    const file = selectedEntry();
    if (!file) {
      return;
    }
    const pane = activePane;
    const dir = (pane === "left" ? leftPane : rightPane).currentPath;
    setDialog({
      kind: "prompt",
      title: "名前の変更",
      initialValue: file.name,
      onSubmit: (name) => {
        setDialog(null);
        if (name.trim() === file.name) {
          return;
        }
        attempt("名前の変更", async () => {
          await renameItem(file.path, name);
          await loadDirectory(pane, dir, { selectName: name.trim() });
        });
      },
    });
  }, [selectedEntry, activePane, leftPane, rightPane, attempt, loadDirectory]);

  /**
   * 指定した項目の新しい名前を入力させて変更します (ツリー表示用).
   * 変更したら, アクティブなペインの一覧も読み込み直し, 呼び出し側 (ツリー) へ新しい名前を知らせます.
   * 名前が変わらないときは, 何もしません.
   *
   * @param path - 名前を変える項目の絶対パス.
   * @param currentName - 今の名前 (入力欄の初期値).
   * @param onRenamed - 変更できたときに呼ぶ関数 (新しい名前が渡される).
   */
  const startRenameAt = useCallback(
    (
      path: string,
      currentName: string,
      onRenamed: (name: string) => void,
    ): void => {
      const pane = activePane;
      const listPath = (pane === "left" ? leftPane : rightPane).currentPath;
      setDialog({
        kind: "prompt",
        title: "名前の変更",
        initialValue: currentName,
        onSubmit: (name) => {
          setDialog(null);
          if (name.trim() === currentName) {
            return;
          }
          attempt("名前の変更", async () => {
            await renameItem(path, name);
            await loadDirectory(pane, listPath, { keepCursor: true });
            onRenamed(name.trim());
          });
        },
      });
    },
    [activePane, leftPane, rightPane, attempt, loadDirectory],
  );

  /** カーソル位置の項目を, 関連付けられた外部アプリで開きます. */
  const openExternal = useCallback((): void => {
    const file = selectedEntry();
    if (file) {
      attempt("外部アプリで開く", () => openItem(file.path));
    }
  }, [selectedEntry, attempt]);

  /**
   * 指定したパスを, 関連付けられた外部アプリで開きます (ツリー表示のファイル用).
   *
   * @param path - 開く対象の絶対パス.
   */
  const openPath = useCallback(
    (path: string): void => {
      void attempt("外部アプリで開く", () => openItem(path));
    },
    [attempt],
  );

  /** カーソル位置の項目を, エディタで開きます. */
  const openEditor = useCallback((): void => {
    const file = selectedEntry();
    if (file) {
      attempt("エディタで開く", () => openInEditor(file.path));
    }
  }, [selectedEntry, attempt]);

  return {
    dialog,
    closeDialog,
    openPrompt,
    openConfirm,
    openChoice,
    startMkdir,
    startMkdirAt,
    startTouch,
    startRename,
    startRenameAt,
    openExternal,
    openPath,
    openEditor,
  };
}
