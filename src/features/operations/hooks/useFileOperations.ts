import { useCallback, useState } from "react";
import log from "loglevel";
import {
  copyItem,
  createDirectory,
  createFile,
  deleteItem,
  openInEditor,
  openItem,
  renameItem,
} from "../../../services/tauriApi";
import type { LoadOptions } from "../../explorer/hooks/useFileList";
import type { FileEntry, PaneId, PaneState } from "../../explorer/types";
import type { DialogState } from "../types";

/**
 * ファイル操作 (作成・名前変更・削除・外部アプリで開く) を扱うフック.
 *
 * @param activePane - アクティブなペイン識別子.
 * @param leftPane - 左ペインの状態.
 * @param rightPane - 右ペインの状態.
 * @param loadDirectory - ペインのディレクトリを読み込む関数.
 * @param setError - エラーメッセージを設定する関数.
 * @returns 表示中のダイアログと, 各操作を開始するハンドラー.
 */
export function useFileOperations(
  activePane: PaneId,
  leftPane: PaneState,
  rightPane: PaneState,
  loadDirectory: (
    pane: PaneId,
    path: string,
    options?: LoadOptions,
  ) => Promise<void>,
  setError: (message: string | null) => void,
) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  /** ダイアログを閉じます. */
  const closeDialog = useCallback((): void => setDialog(null), []);

  /**
   * 文字列を 1 つ入力させるダイアログを開きます.
   *
   * @param title - ダイアログの見出し.
   * @param onSubmit - 入力を確定したときの処理.
   */
  const openPrompt = useCallback(
    (title: string, onSubmit: (value: string) => void): void => {
      setDialog({
        kind: "prompt",
        title,
        initialValue: "",
        onSubmit: (value) => {
          setDialog(null);
          onSubmit(value);
        },
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
        log.info(`[React] ${label} 完了`);
      } catch (e) {
        log.error(`[React] ${label} 失敗:`, e);
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
   * カーソル位置の項目を, 確認のうえ削除します.
   *
   * @param permanent - true の場合は完全に削除し, false の場合はゴミ箱へ移動する.
   */
  const startDelete = useCallback(
    (permanent: boolean): void => {
      const file = selectedEntry();
      if (!file) {
        return;
      }
      const pane = activePane;
      const dir = (pane === "left" ? leftPane : rightPane).currentPath;
      setDialog({
        kind: "confirm",
        title: permanent ? "完全に削除" : "ゴミ箱へ移動",
        message: permanent
          ? `「${file.name}」を完全に削除しますか? 元に戻せません. (y/n)`
          : `「${file.name}」をゴミ箱へ移動しますか? (y/n)`,
        onConfirm: () => {
          setDialog(null);
          attempt("削除", async () => {
            await deleteItem(file.path, permanent);
            await loadDirectory(pane, dir, { keepCursor: true });
          });
        },
      });
    },
    [selectedEntry, activePane, leftPane, rightPane, attempt, loadDirectory],
  );

  /** カーソル位置の項目を, 対向ペインのディレクトリへコピーします. */
  const copyToOpposite = useCallback((): void => {
    const file = selectedEntry();
    if (!file) {
      return;
    }
    const targetPane: PaneId = activePane === "left" ? "right" : "left";
    const targetDir = (targetPane === "left" ? leftPane : rightPane)
      .currentPath;
    attempt("コピー", async () => {
      await copyItem(file.path, targetDir);
      await loadDirectory(targetPane, targetDir, { keepCursor: true });
    });
  }, [selectedEntry, activePane, leftPane, rightPane, attempt, loadDirectory]);

  /** カーソル位置の項目を, 関連付けられた外部アプリで開きます. */
  const openExternal = useCallback((): void => {
    const file = selectedEntry();
    if (file) {
      attempt("外部アプリで開く", () => openItem(file.path));
    }
  }, [selectedEntry, attempt]);

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
    startMkdir,
    startTouch,
    startRename,
    startDelete,
    copyToOpposite,
    openExternal,
    openEditor,
  };
}
