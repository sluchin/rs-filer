import { useCallback, useEffect, useRef, useState } from "react";
import loglevel from "loglevel";
import {
  getHomeDir,
  loadConfig,
  loadHistory,
  readDirectory,
  saveHistory,
  searchContents,
  searchDirectory,
  saveLastPaths,
} from "../../../services/tauriApi";
import { DEFAULT_HISTORY_LIMIT } from "../../settings/types";
import type { FileEntry, PaneId, PaneState, SearchKind } from "../types";
import {
  getParentPath,
  toNativePath,
  uniqueNativePaths,
} from "../../../utils/path";
import { deriveFiles } from "../view";
import { pushHistory } from "../history";

/** この機能のロガー. */
const log = loglevel.getLogger("explorer");

/** ペインの初期状態. */
const INITIAL_PANE: PaneState = {
  currentPath: "/",
  files: [],
  allFiles: [],
  selectedIndex: 0,
  marks: [],
  flags: [],
  showHidden: false,
  showDetails: true,
  sort: { key: "name", desc: false },
  filter: null,
  search: null,
  history: [],
  historyIndex: -1,
};

/** 再帰検索で集める件数の上限. */
export const SEARCH_LIMIT = 5000;

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
 * ペインを操作するフック (`useNavigation` / `useFileOperations` / `useTransfer`) が共通で使う, ペインの状態と操作.
 */
export interface PaneDeps {
  /** アクティブなペイン識別子. */
  activePane: PaneId;
  /** 左ペインの状態. */
  leftPane: PaneState;
  /** 右ペインの状態. */
  rightPane: PaneState;
  /** ペインのディレクトリを読み込む関数. */
  loadDirectory: (
    pane: PaneId,
    path: string,
    options?: LoadOptions,
  ) => Promise<void>;
  /** エラーメッセージを設定する関数. */
  setError: (message: string | null) => void;
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
 * 初回マウント時に, 左右のペインの前回のディレクトリを開きます. 保存されていない場合や開けない場合は,
 * ホームディレクトリ (取得失敗時はルート) を開きます. ディレクトリが変わるたびに, 設定ファイルへ保存します.
 * ディレクトリの移動履歴も, 前回のものを読み込み (今は無いディレクトリは, バックエンドが除く), 履歴が変わるたびに,
 * 履歴のファイルへ保存します. 履歴の件数の上限は, 設定の `history_limit` (既定は 1000) です.
 *
 * @param onError - 読み込みに失敗したときに, エラーメッセージを受け取る関数 (ログへの記録など).
 * @returns ペイン状態, エラー, および状態を操作する関数.
 */
export function useFileList(onError: (message: string) => void) {
  const [leftPane, setLeftPane] = useState<PaneState>(INITIAL_PANE);
  const [rightPane, setRightPane] = useState<PaneState>(INITIAL_PANE);
  const [error, setError] = useState<string | null>(null);
  /** 初期化(前回のディレクトリの復元)が終わったら true. 終わるまでは, ディレクトリを保存しない. */
  const restored = useRef(false);
  /** 履歴の, ペインごとの件数の上限 (設定の `history_limit`). */
  const historyLimit = useRef(DEFAULT_HISTORY_LIMIT);
  /** ペインごとの最新の読み込みリクエスト ID. 古い非同期応答で上書きされるのを防ぐ. */
  const latestLoadId = useRef<Record<PaneId, number>>({
    left: 0,
    right: 0,
  });

  /**
   * 読み込み中のもの (ディレクトリの読み込みと検索) があれば, その結果を捨てるようにします.
   * タブを替えるとき, 前のタブの読み込みの結果が, 替えたあとのタブに混ざらないようにするために使います.
   */
  const invalidateLoads = useCallback((): void => {
    latestLoadId.current.left += 1;
    latestLoadId.current.right += 1;
  }, []);

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
   * @param requestedPath - 読み込み対象のディレクトリ絶対パス.
   * @param options - カーソル位置・履歴に関するオプション.
   * @returns 読み込めたら true. 失敗したら false.
   */
  const tryLoadDirectory = useCallback(
    async (
      pane: PaneId,
      requestedPath: string,
      options: LoadOptions = {},
    ): Promise<boolean> => {
      // Windows のパスは `\` 区切りにそろえる (履歴やブックマークで, 区切りが混ざらないように)
      const targetPath = toNativePath(requestedPath);
      const loadId = ++latestLoadId.current[pane];
      try {
        setError(null);
        log.debug(`${pane}ペイン 読み込み要求:`, targetPath);

        const result = await readDirectory(targetPath);

        // 新しいリクエストが既に開始されている場合は, この結果を破棄する (競合状態の防止)
        if (latestLoadId.current[pane] !== loadId) {
          log.debug(`${pane}ペイン 古いリクエストのため破棄:`, targetPath);
          return false;
        }

        updatePane(pane, (prev) => {
          const moved = targetPath !== prev.currentPath;
          const filter = moved ? null : prev.filter;
          const files = deriveFiles(result, { ...prev, filter });
          const existing = new Set(result.map((f) => f.path));
          let { history, historyIndex } = prev;
          if (options.historyIndex !== undefined) {
            historyIndex = options.historyIndex;
          } else {
            ({ history, historyIndex } = pushHistory(
              { history, historyIndex },
              targetPath,
              historyLimit.current,
            ));
          }
          return {
            ...prev,
            currentPath: targetPath,
            allFiles: result,
            files,
            filter,
            search: null,
            marks: moved ? [] : prev.marks.filter((m) => existing.has(m)),
            flags: moved ? [] : prev.flags.filter((m) => existing.has(m)),
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

        log.info(`${pane}ペイン 取得完了: ${result.length} 件`);
        return true;
      } catch (e) {
        // 新しいリクエストが進行中の場合は, 古いエラーで上書きしない
        if (latestLoadId.current[pane] !== loadId) {
          return false;
        }
        log.error(`${pane}ペイン 読み込み失敗:`, e);
        setError(String(e));
        onError(String(e));
        return false;
      }
    },
    [updatePane, onError],
  );

  /**
   * 指定されたパスのディレクトリを読み込みます. 失敗した場合は, エラーを設定して, 何もしません.
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
      await tryLoadDirectory(pane, targetPath, options);
    },
    [tryLoadDirectory],
  );

  /**
   * ペインのディレクトリの下を再帰的に探して, 結果を一覧に出します (一覧は検索の結果に替わり, 各項目の名前は
   * ディレクトリからの相対パスになります). 検索をやめるには, ディレクトリを読み込み直します.
   *
   * @param pane - 対象のペイン識別子.
   * @param root - 探し始めるディレクトリの絶対パス.
   * @param kind - 検索の種類 (名前で探すか, ファイルの中身で探すか).
   * @param query - 名前の一部かワイルドカード (名前の検索), または正規表現 (中身の検索).
   * @param showHidden - 隠しファイルも探すかどうか.
   */
  const searchPane = useCallback(
    async (
      pane: PaneId,
      root: string,
      kind: SearchKind,
      query: string,
      showHidden: boolean,
    ): Promise<void> => {
      const loadId = ++latestLoadId.current[pane];
      try {
        setError(null);
        log.debug(`${pane}ペイン 再帰検索:`, root, query);
        const search = kind === "name" ? searchDirectory : searchContents;
        const result = await search(root, query, showHidden, SEARCH_LIMIT);
        if (latestLoadId.current[pane] !== loadId) {
          return;
        }
        updatePane(pane, (prev) => ({
          ...prev,
          allFiles: result.entries,
          files: deriveFiles(result.entries, { ...prev, filter: null }),
          filter: null,
          marks: [],
          flags: [],
          selectedIndex: 0,
          search: { kind, query, truncated: result.truncated },
        }));
        log.info(`${pane}ペイン 検索完了: ${result.entries.length} 件`);
      } catch (e) {
        if (latestLoadId.current[pane] !== loadId) {
          return;
        }
        log.error(`${pane}ペイン 検索失敗:`, e);
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

  // 初期化: 左右のペインの前回のディレクトリを開く. 無い場合や開けない場合は, ホームディレクトリを開く.
  useEffect(() => {
    const init = async (): Promise<void> => {
      let saved: Partial<Record<PaneId, string>> = {};
      try {
        const config = await loadConfig();
        saved = config.last_paths ?? {};
        historyLimit.current = config.history_limit ?? DEFAULT_HISTORY_LIMIT;
      } catch (e) {
        log.warn("前回のディレクトリの読み込みに失敗:", e);
      }
      // 前回の履歴を戻してから, ディレクトリを開く. 開いたディレクトリは, 履歴の末尾へ移る.
      try {
        const loaded = await loadHistory();
        (["left", "right"] as const).forEach((pane) => {
          // 片方のペインの履歴が無いファイルでも, そのペインは空の履歴から始める.
          // 以前の版で保存した, 区切りが混ざったパスも, そろえて重複を除く
          const history = uniqueNativePaths(loaded[pane] ?? []);
          updatePane(pane, (prev) => ({
            ...prev,
            history,
            historyIndex: history.length - 1,
          }));
        });
      } catch (e) {
        log.warn("移動履歴の読み込みに失敗:", e);
      }
      let home: string | null = null;
      const openPane = async (pane: PaneId): Promise<void> => {
        const last = saved[pane];
        if (last !== undefined && (await tryLoadDirectory(pane, last))) {
          return;
        }
        if (home === null) {
          try {
            home = await getHomeDir();
          } catch (e) {
            log.warn("ホームディレクトリ取得失敗, ルートを使用します:", e);
            home = "/";
          }
        }
        await loadDirectory(pane, home);
      };
      await Promise.all([openPane("left"), openPane("right")]);
      restored.current = true;
    };
    init();
  }, [tryLoadDirectory, loadDirectory, updatePane]);

  // ディレクトリが変わったら, 設定ファイルへ保存する (復元が終わるまでは, 保存しない).
  const leftPath = leftPane.currentPath;
  const rightPath = rightPane.currentPath;
  useEffect(() => {
    if (!restored.current) {
      return;
    }
    saveLastPaths({ left: leftPath, right: rightPath }).catch((e) => {
      log.warn("前回のディレクトリの保存に失敗:", e);
    });
  }, [leftPath, rightPath]);

  // 履歴が変わったら, 履歴のファイルへ保存する (復元が終わるまでは, 保存しない).
  // 履歴の配列は, ディレクトリを追加したときだけ新しくなる (戻る・進むでは, 保存しない).
  const leftHistory = leftPane.history;
  const rightHistory = rightPane.history;
  useEffect(() => {
    if (!restored.current) {
      return;
    }
    saveHistory({ left: leftHistory, right: rightHistory }).catch((e) => {
      log.warn("移動履歴の保存に失敗:", e);
    });
  }, [leftHistory, rightHistory]);

  return {
    leftPane,
    rightPane,
    error,
    setError,
    updatePane,
    loadDirectory,
    invalidateLoads,
    searchPane,
    setView,
    moveCursor,
  };
}
