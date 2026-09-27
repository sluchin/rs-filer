import { useCallback, useEffect, useState } from "react";
import log from "loglevel";
import { getHomeDir, readDirectory } from "../../../services/tauriApi";
import type { FileEntry, PaneId, PaneState } from "../types";

/** ペインの初期状態. */
const INITIAL_PANE: PaneState = {
  currentPath: "/",
  files: [],
  selectedIndex: 0,
};

/**
 * ディレクトリ読み込み時のオプション.
 */
export interface LoadOptions {
  /** true の場合, カーソル位置を維持する (再読み込み用). 既定ではカーソルを先頭へ移す. */
  keepCursor?: boolean;
  /** 読み込み後にカーソルを合わせる項目の名前. */
  selectName?: string;
}

/**
 * 読み込み後のカーソル位置を決めます.
 *
 * @param files - 読み込んだエントリ一覧.
 * @param previous - 読み込み前のカーソル位置.
 * @param options - カーソル位置に関するオプション.
 * @returns 新しいカーソル位置.
 */
function cursorAfterLoad(
  files: FileEntry[],
  previous: number,
  options: LoadOptions,
): number {
  const named =
    options.selectName === undefined
      ? -1
      : files.findIndex((f) => f.name === options.selectName);
  if (named >= 0) {
    return named;
  }
  return options.keepCursor
    ? Math.min(previous, Math.max(0, files.length - 1))
    : 0;
}

/**
 * 左右ペインの状態とディレクトリ読み込みを管理するフック.
 *
 * 初回マウント時に, 左右ともにホームディレクトリ (取得失敗時はルート) を開きます.
 *
 * @returns ペイン状態, エラー, および状態を操作する関数.
 */
export function useFileList() {
  const [leftPane, setLeftPane] = useState<PaneState>(INITIAL_PANE);
  const [rightPane, setRightPane] = useState<PaneState>(INITIAL_PANE);
  const [error, setError] = useState<string | null>(null);

  /**
   * 指定したペインの状態を更新します.
   *
   * @param pane - 更新対象のペイン識別子.
   * @param updater - 直前の状態から新しい状態を作る関数.
   */
  const updatePane = useCallback(
    (pane: PaneId, updater: (prev: PaneState) => PaneState): void => {
      if (pane === "left") {
        setLeftPane(updater);
      } else {
        setRightPane(updater);
      }
    },
    [],
  );

  /**
   * 指定されたパスのディレクトリ内容を取得し, 対象ペインの状態を更新します.
   *
   * @param pane - 更新対象のペイン識別子.
   * @param targetPath - 読み込み対象のディレクトリ絶対パス.
   * @param options - カーソル位置に関するオプション.
   */
  const loadDirectory = useCallback(
    async (
      pane: PaneId,
      targetPath: string,
      options: LoadOptions = {},
    ): Promise<void> => {
      try {
        setError(null);
        log.debug(`[React] ${pane}ペイン 読み込み要求:`, targetPath);

        const result = await readDirectory(targetPath);

        updatePane(pane, (prev) => ({
          ...prev,
          currentPath: targetPath,
          files: result,
          selectedIndex: cursorAfterLoad(result, prev.selectedIndex, options),
        }));

        log.info(`[React] ${pane}ペイン 取得完了: ${result.length} 件`);
      } catch (e) {
        log.error(`[React] ${pane}ペイン 読み込み失敗:`, e);
        setError(String(e));
      }
    },
    [updatePane],
  );

  /**
   * 指定したペインのカーソルを上下に動かします. 範囲外にはみ出さない.
   *
   * @param pane - 対象のペイン識別子.
   * @param delta - 移動量 (下向きが正).
   */
  const moveCursor = useCallback(
    (pane: PaneId, delta: number): void => {
      updatePane(pane, (prev) => ({
        ...prev,
        selectedIndex: Math.min(
          Math.max(0, prev.files.length - 1),
          Math.max(0, prev.selectedIndex + delta),
        ),
      }));
    },
    [updatePane],
  );

  // 初期化: 左右ともにホームディレクトリを開く
  useEffect(() => {
    const init = async (): Promise<void> => {
      let home = "/";
      try {
        home = await getHomeDir();
      } catch (e) {
        log.warn("[React] ホームディレクトリ取得失敗, ルートを使用します:", e);
      }
      await Promise.all([
        loadDirectory("left", home),
        loadDirectory("right", home),
      ]);
    };
    init();
  }, [loadDirectory]);

  return {
    leftPane,
    rightPane,
    error,
    setError,
    updatePane,
    loadDirectory,
    moveCursor,
  };
}
