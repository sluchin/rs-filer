import { useMemo, useState } from "react";
import type { CopyTarget } from "../features/explorer/copyText";
import type { PaneId } from "../features/explorer/types";
import type { PanelActions } from "../features/keybindings/hooks/useCommandDispatcher";

/**
 * 右クリックのメニュー (フルパスや名前のコピー) の対象と位置.
 */
export interface CopyMenuState {
  /** コピーの対象. */
  target: CopyTarget;
  /** メニューを出す x 座標. */
  x: number;
  /** メニューを出す y 座標. */
  y: number;
  /** 「ディレクトリへ移動」の項目の処理 (最近開いたファイルの一覧のとき). 無ければその項目は出さない. */
  onReveal?: () => void;
  /** 「複製」の項目を出すか (既定は出す). 最近開いたファイルの一覧では出さない. */
  noDuplicate?: boolean;
}

/** 左右のペインごとの, 表示するかどうか. */
type PaneFlags = Record<PaneId, boolean>;

/** どちらのペインにも出していない状態. */
const NO_PANES: PaneFlags = { left: false, right: false };

/**
 * タブごとに持つ, ペインの表示の差し替え (ブックマーク・移動履歴・最近開いたファイルの一覧と, ツリー).
 */
export interface PaneOverlays {
  /** ブックマークの一覧を出しているペイン. */
  bookmarks: PaneFlags;
  /** 移動履歴の一覧を出しているペイン. */
  history: PaneFlags;
  /** 最近開いたファイルの一覧を出しているペイン. */
  recent: PaneFlags;
  /** ツリー表示にしているペイン. */
  tree: PaneFlags;
}

/** どの一覧も出していない状態 (新しいタブの始まり). */
export const NO_OVERLAYS: PaneOverlays = {
  bookmarks: NO_PANES,
  history: NO_PANES,
  recent: NO_PANES,
  tree: NO_PANES,
};

/**
 * ダイアログ・コマンドパレット・右クリックのメニューの開閉と, ペインの表示の差し替え
 * (プレビュー・詳細・ブックマーク・移動履歴・最近開いたファイル・ツリー) の状態を, まとめて管理します.
 *
 * 開く・閉じる操作は, 描画のたびに作り直さない (`memo` した子コンポーネントへ渡しても, 描き直しを起こさない).
 *
 * @returns 状態と, 開く・閉じる操作.
 */
export function useDialogs() {
  const [bookmarkPanes, setBookmarkPanes] = useState<PaneFlags>(NO_PANES);
  const [historyPanes, setHistoryPanes] = useState<PaneFlags>(NO_PANES);
  const [recentPanes, setRecentPanes] = useState<PaneFlags>(NO_PANES);
  const [treePanes, setTreePanes] = useState<PaneFlags>(NO_PANES);
  const [logOpen, setLogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewOn, setPreviewOn] = useState(false);
  const [infoOn, setInfoOn] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteValue, setPaletteValue] = useState("");
  const [copyMenu, setCopyMenu] = useState<CopyMenuState | null>(null);

  const actions = useMemo(() => {
    const panels: PanelActions = {
      // プレビューと詳細は, どちらも反対側のペインに出すので, 一方を出すときは, もう一方を消す.
      togglePreview: () => {
        setInfoOn(false);
        setPreviewOn((on) => !on);
      },
      toggleInfo: () => {
        setPreviewOn(false);
        setInfoOn((on) => !on);
      },
      openLog: () => setLogOpen(true),
      openHistoryList: (pane) =>
        setHistoryPanes((p) => ({ ...p, [pane]: true })),
      openRecentFiles: (pane) =>
        setRecentPanes((p) => ({ ...p, [pane]: true })),
      openBookmarks: (pane) =>
        setBookmarkPanes((p) => ({ ...p, [pane]: true })),
      toggleTree: (pane) => setTreePanes((p) => ({ ...p, [pane]: !p[pane] })),
      openPalette: () => {
        setPaletteValue("");
        setPaletteOpen(true);
      },
      openHelp: () => setHelpOpen(true),
    };
    return {
      ...panels,
      /** 指定したペインの, ブックマークの一覧を閉じる. */
      closeBookmarks: (pane: PaneId) =>
        setBookmarkPanes((p) => ({ ...p, [pane]: false })),
      /** 指定したペインの, 移動履歴の一覧を閉じる. */
      closeHistoryList: (pane: PaneId) =>
        setHistoryPanes((p) => ({ ...p, [pane]: false })),
      /** 指定したペインの, 最近開いたファイルの一覧を閉じる. */
      closeRecentFiles: (pane: PaneId) =>
        setRecentPanes((p) => ({ ...p, [pane]: false })),
      /** 指定したペインの, ツリー表示を閉じる. */
      closeTree: (pane: PaneId) =>
        setTreePanes((p) => ({ ...p, [pane]: false })),
      /** 操作ログを閉じる. */
      closeLog: () => setLogOpen(false),
      /** ヘルプを閉じる. */
      closeHelp: () => setHelpOpen(false),
      /** コマンドパレットを閉じる. */
      closePalette: () => setPaletteOpen(false),
      /** コマンドパレットの入力を変える. */
      setPaletteValue,
      /** 右クリックのメニューを開く. */
      openCopyMenu: (menu: CopyMenuState) => setCopyMenu(menu),
      /** 右クリックのメニューを閉じる. */
      closeCopyMenu: () => setCopyMenu(null),
      /** 一覧の表示を, タブが保存していたものに替える (タブを替えたとき). */
      setOverlays: (overlays: PaneOverlays) => {
        setBookmarkPanes(overlays.bookmarks);
        setHistoryPanes(overlays.history);
        setRecentPanes(overlays.recent);
        setTreePanes(overlays.tree);
      },
    };
  }, []);

  /**
   * 全体のキー操作を止めるもの (ダイアログ・パレット・メニュー, アクティブなペインの一覧やツリー) を
   * 出しているかを判定する. 反対側のペインの一覧は見ない (反対側のペインは, 通常どおり操作できるようにするため).
   *
   * @param activePane - アクティブなペイン.
   * @returns キー操作を止める場合は true.
   */
  const isBlocking = (activePane: PaneId): boolean =>
    bookmarkPanes[activePane] ||
    historyPanes[activePane] ||
    recentPanes[activePane] ||
    treePanes[activePane] ||
    logOpen ||
    paletteOpen ||
    helpOpen ||
    copyMenu !== null;

  /** 今のタブの, 一覧とツリーの表示 (タブを替えるとき, 保存する). */
  const overlays: PaneOverlays = {
    bookmarks: bookmarkPanes,
    history: historyPanes,
    recent: recentPanes,
    tree: treePanes,
  };

  return {
    overlays,
    bookmarkPanes,
    historyPanes,
    recentPanes,
    treePanes,
    logOpen,
    helpOpen,
    previewOn,
    infoOn,
    paletteOpen,
    paletteValue,
    copyMenu,
    isBlocking,
    ...actions,
  };
}
