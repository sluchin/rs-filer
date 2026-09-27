import { useCallback, useEffect, useState } from "react";
import log from "loglevel";
import { getHomeDir, readDirectory } from "../../../services/tauriApi";
import type { FileEntry, PaneId, PaneState } from "../types";
import { getParentPath } from "../../../utils/path";
import { deriveFiles } from "../view";

/** ペインの初期状態. */
const INITIAL_PANE: PaneState = {
  currentPath: "/",
  files: [],
  allFiles: [],
  selectedIndex: 0,
  marks: [],
  showHidden: false,
  showDetails: true,
  sort: { key: "name", desc: false },
  filter: null,
  history: [],
  historyIndex: -1,
};

/**
 * ディレクトリ読み込み時のオプション.
 */
export interface LoadOptions {
  /** true の場合, カーソル位置を維持する (再読み込み用). 既定ではカーソルを先頭へ移す. */
  keepCursor?: boolean;
  /** 読み込み後にカーソルを合わせる項目の名前. */
  selectName?: string;
  /** 履歴の中の位置へ移動する場合の, その位置 (戻る・進む用). 指定しない場合は, 新しいディレクトリを履歴へ追加する. */
  historyIndex?: number;
}

/**
 * 表示の設定として変更できる項目.
 */
export type ViewPatch = Partial<
  Pick<PaneState, "showHidden" | "showDetails" | "sort" | "filter">
>;

/**
 * 読み込み後のカーソル位置を決めます.
 *
 * @param files - 表示するエントリ一覧.
 * @param previous - 読み込み前のカーソル位置.
 * @param options - カーソル位置に関するオプション.
 * @param hasParent - 親ディレクトリの行 (`..`) があるかどうか. ある場合, カーソルは -1 (`..` の行) にも置ける.
 * @returns 新しいカーソル位置.
 */
function cursorAfterLoad(
  files: FileEntry[],
  previous: number,
  options: LoadOptions,
  hasParent: boolean,
): number {
  const named =
    options.selectName === undefined
      ? -1
      : files.findIndex((f) => f.name === options.selectName);
  if (named >= 0) {
    return named;
  }
  const lowest = hasParent ? -1 : 0;
  return options.keepCursor
    ? Math.max(lowest, Math.min(previous, files.length - 1))
    : 0;
}

/**
 * 左右ペインの状態とディレクトリ読み込みを管理するフック.
 *
 * 初回マウント時に, 左右ともにホームディレクトリ (取得失敗時はルート) を開きます.
 *
 * @param onError - 読み込みに失敗したときに, エラーメッセージを受け取る関数 (ログへの記録など).
 * @returns ペイン状態, エラー, および状態を操作する関数.
 */
export function useFileList(onError: (message: string) => void) {
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
   * ディレクトリが変わった場合は, マークと絞り込みを解除し, 履歴へ追加します.
   *
   * @param pane - 更新対象のペイン識別子.
   * @param targetPath - 読み込み対象のディレクトリ絶対パス.
   * @param options - カーソル位置・履歴に関するオプション.
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

        updatePane(pane, (prev) => {
          const moved = targetPath !== prev.currentPath;
          const filter = moved ? null : prev.filter;
          const files = deriveFiles(result, { ...prev, filter });
          const existing = new Set(result.map((f) => f.path));
          let { history, historyIndex } = prev;
          if (options.historyIndex !== undefined) {
            historyIndex = options.historyIndex;
          } else if (history[historyIndex] !== targetPath) {
            history = [...history.slice(0, historyIndex + 1), targetPath];
            historyIndex = history.length - 1;
          }
          return {
            ...prev,
            currentPath: targetPath,
            allFiles: result,
            files,
            filter,
            marks: moved ? [] : prev.marks.filter((m) => existing.has(m)),
            selectedIndex: cursorAfterLoad(
              files,
              prev.selectedIndex,
              options,
              getParentPath(targetPath) !== null,
            ),
            history,
            historyIndex,
          };
        });

        log.info(`[React] ${pane}ペイン 取得完了: ${result.length} 件`);
      } catch (e) {
        log.error(`[React] ${pane}ペイン 読み込み失敗:`, e);
        setError(String(e));
        onError(String(e));
      }
    },
    [updatePane, onError],
  );

  /**
   * 指定したペインの表示設定 (隠しファイル・詳細表示・ソート・絞り込み) を変更します.
   * カーソルは, 同じ名前の項目があればその項目に合わせます.
   *
   * @param pane - 対象のペイン識別子.
   * @param patch - 変更する設定.
   */
  const setView = useCallback(
    (pane: PaneId, patch: ViewPatch): void => {
      updatePane(pane, (prev) => {
        const next = { ...prev, ...patch };
        const files = deriveFiles(next.allFiles, next);
        const name = prev.files[prev.selectedIndex]?.name;
        return {
          ...next,
          files,
          selectedIndex: cursorAfterLoad(
            files,
            prev.selectedIndex,
            { selectName: name, keepCursor: true },
            getParentPath(prev.currentPath) !== null,
          ),
        };
      });
    },
    [updatePane],
  );

  /**
   * 指定したペインのカーソルを上下に動かします. 範囲外にはみ出さない. 親ディレクトリの行 (`..`) がある場合は, 先頭の上 (-1) まで動かせる.
   *
   * @param pane - 対象のペイン識別子.
   * @param delta - 移動量 (下向きが正).
   */
  const moveCursor = useCallback(
    (pane: PaneId, delta: number): void => {
      updatePane(pane, (prev) => {
        const lowest = getParentPath(prev.currentPath) !== null ? -1 : 0;
        return {
          ...prev,
          selectedIndex: Math.min(
            Math.max(lowest, prev.files.length - 1),
            Math.max(lowest, prev.selectedIndex + delta),
          ),
        };
      });
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
    setView,
    moveCursor,
  };
}
