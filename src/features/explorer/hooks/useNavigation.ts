import { useCallback, useState } from "react";
import log from "loglevel";
import { listDrives } from "../../../services/tauriApi";
import { getBaseName, getParentPath } from "../../../utils/path";
import type { LoadOptions } from "./useFileList";
import type { FileEntry, PaneId, PaneState } from "../types";

/**
 * ディレクトリ移動 (親へ・入る・再読み込み・ドライブ切り替え) を扱うフック.
 *
 * @param activePane - アクティブなペイン識別子.
 * @param leftPane - 左ペインの状態.
 * @param rightPane - 右ペインの状態.
 * @param loadDirectory - ペインのディレクトリを読み込む関数.
 * @param setError - エラーメッセージを設定する関数.
 * @returns 移動用のハンドラーとドライブ選択の状態.
 */
export function useNavigation(
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
  /** ドライブ選択ダイアログに表示するドライブ一覧. null の場合は非表示. */
  const [drives, setDrives] = useState<string[] | null>(null);

  /**
   * 指定したペインを 1 つ上の親ディレクトリへ移動し, 元のディレクトリにカーソルを合わせます.
   *
   * @param pane - 対象のペイン識別子.
   */
  const handleParentDir = useCallback(
    (pane: PaneId): void => {
      const current = pane === "left" ? leftPane : rightPane;
      const parent = getParentPath(current.currentPath);
      if (parent !== null) {
        loadDirectory(pane, parent, {
          selectName: getBaseName(current.currentPath),
        });
      }
    },
    [leftPane, rightPane, loadDirectory],
  );

  /**
   * ディレクトリの中へ入ります.
   *
   * @param pane - 対象のペイン識別子.
   * @param file - 入るディレクトリ.
   */
  const handleEnter = useCallback(
    (pane: PaneId, file: FileEntry): void => {
      loadDirectory(pane, file.path);
    },
    [loadDirectory],
  );

  /**
   * アクティブなペインを再読み込みします. カーソル位置は維持されます.
   */
  const handleReload = useCallback((): void => {
    const current = activePane === "left" ? leftPane : rightPane;
    loadDirectory(activePane, current.currentPath, { keepCursor: true });
  }, [activePane, leftPane, rightPane, loadDirectory]);

  /**
   * ドライブ選択ダイアログを開きます.
   */
  const showDrives = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setDrives(await listDrives());
    } catch (e) {
      log.error("[React] ドライブ一覧の取得に失敗:", e);
      setError(String(e));
    }
  }, [setError]);

  /**
   * ドライブ選択ダイアログを閉じます.
   */
  const closeDrives = useCallback((): void => setDrives(null), []);

  /**
   * 選択されたドライブのルートへ, アクティブなペインを移動します.
   *
   * @param root - ドライブのルートパス.
   */
  const selectDrive = useCallback(
    (root: string): void => {
      setDrives(null);
      loadDirectory(activePane, root);
    },
    [activePane, loadDirectory],
  );

  return {
    drives,
    handleParentDir,
    handleEnter,
    handleReload,
    showDrives,
    closeDrives,
    selectDrive,
  };
}
