import type { RefObject } from "react";
import log from "loglevel";
import type { useBookmarks } from "../../bookmarks/hooks/useBookmarks";
import type { CopyKind, CopyTarget } from "../../explorer/copyText";
import type { useFileList } from "../../explorer/hooks/useFileList";
import type { useMarks } from "../../explorer/hooks/useMarks";
import type { useNavigation } from "../../explorer/hooks/useNavigation";
import type { FileEntry, PaneId, PaneState } from "../../explorer/types";
import { nextSort } from "../../explorer/view";
import type { useFileOperations } from "../../operations/hooks/useFileOperations";
import {
  targetsOf,
  type useTransfer,
} from "../../operations/hooks/useTransfer";
import { DEFAULT_NAME_COLUMN_WIDTH } from "../../settings/types";
import type { useSettings } from "../../../hooks/useSettings";
import {
  getHomeDir,
  openTerminal,
  quitApp,
  runExternalCommand,
} from "../../../services/tauriApi";
import type { Command } from "../types";

/** ページ送り (`PageUp` / `PageDown`) で動かす行数. */
const PAGE_SIZE = 10;

/** 名前の列の幅を, 1 回で変える量 (ピクセル). */
const COLUMN_STEP = 10;

/** 名前の列の幅の最小値 (ピクセル). */
const MIN_COLUMN_WIDTH = 30;

/**
 * ペインの表示の差し替えやダイアログを開く・閉じる操作 (`useDialogs` が提供する).
 */
export interface PanelActions {
  /** プレビューの表示を切り替える (詳細は消す). */
  togglePreview: () => void;
  /** 詳細の表示を切り替える (プレビューは消す). */
  toggleInfo: () => void;
  /** 操作ログを開く. */
  openLog: () => void;
  /** 指定したペインに, 移動履歴の一覧を出す. */
  openHistoryList: (pane: PaneId) => void;
  /** 指定したペインに, ブックマークの一覧を出す. */
  openBookmarks: (pane: PaneId) => void;
  /** 指定したペインの, ツリー表示を切り替える. */
  toggleTree: (pane: PaneId) => void;
  /** コマンドパレットを, 空の入力で開く. */
  openPalette: () => void;
  /** ヘルプを開く. */
  openHelp: () => void;
}

/**
 * `useCommandDispatcher` が使う, 各機能の状態と操作.
 */
export interface CommandDispatcherDeps {
  /** アクティブなペイン. */
  activePane: PaneId;
  /** 左ペインの状態. */
  leftPane: PaneState;
  /** 右ペインの状態. */
  rightPane: PaneState;
  /** アクティブなペインを切り替える. */
  switchPane: () => void;
  /** 一覧の操作 (`useFileList`). */
  fileList: Pick<
    ReturnType<typeof useFileList>,
    "moveCursor" | "loadDirectory" | "setView"
  >;
  /** ディレクトリの移動 (`useNavigation`). */
  navigation: ReturnType<typeof useNavigation>;
  /** 作成・名前変更・外部アプリ (`useFileOperations`). */
  operations: ReturnType<typeof useFileOperations>;
  /** コピー・移動・削除 (`useTransfer`). */
  transfer: ReturnType<typeof useTransfer>;
  /** マーク (`useMarks`). */
  marks: ReturnType<typeof useMarks>;
  /** 設定 (`useSettings`). */
  settings: ReturnType<typeof useSettings>;
  /** ブックマーク (`useBookmarks`). */
  bookmarks: Pick<ReturnType<typeof useBookmarks>, "toggleBookmark">;
  /** ペインの表示の差し替えとダイアログ. */
  panels: PanelActions;
  /** ペインごとのパスの入力欄. */
  pathInputs: RefObject<Record<PaneId, HTMLInputElement | null>>;
  /** ペインごとの絞り込みの入力欄. */
  filterInputs: RefObject<Record<PaneId, HTMLInputElement | null>>;
  /** 項目を開く (ディレクトリなら入り, ファイルなら外部アプリで開く). */
  openEntry: (pane: PaneId, file: FileEntry | undefined) => void;
  /** 対象のフルパスか名前を, 文字としてクリップボードへコピーする. */
  copyText: (target: CopyTarget, kind: CopyKind) => void;
  /** エラーを表示し, 操作ログにも記録する. */
  reportError: (message: string | null) => void;
}

/**
 * キー入力やコマンドパレットから解決されたコマンドを, 各機能のフックへ振り分けて実行する関数を返します.
 *
 * @param deps - 各機能の状態と操作.
 * @returns コマンドを実行する関数.
 */
export function useCommandDispatcher(
  deps: CommandDispatcherDeps,
): (command: Command) => void {
  const {
    activePane,
    leftPane,
    rightPane,
    switchPane,
    fileList: { moveCursor, loadDirectory, setView },
    navigation,
    operations,
    transfer,
    marks,
    settings,
    bookmarks,
    panels,
    pathInputs,
    filterInputs,
    openEntry,
    copyText,
    reportError,
  } = deps;
  const active = activePane === "left" ? leftPane : rightPane;

  /**
   * アクティブなペインのカーソル位置の項目のフルパスか名前を, 文字としてコピーする (`..` の行と, 空の一覧では
   * コピーしない).
   */
  const copyCursorText = (kind: CopyKind): void => {
    const file = active.files[active.selectedIndex];
    if (!file) {
      reportError("対象の項目が選択されていません.");
      return;
    }
    copyText({ path: file.path, name: file.name, isDir: file.is_dir }, kind);
  };

  /** アクティブなペインの, 名前の列の幅を変える. */
  const resizeNameColumn = (delta: number): void => {
    const paneWidths = settings.config.pane_column_widths[activePane];
    const current = paneWidths.col_name ?? DEFAULT_NAME_COLUMN_WIDTH;
    settings.updatePaneColumnWidth(activePane, {
      ...paneWidths,
      col_name: Math.max(MIN_COLUMN_WIDTH, current + delta),
    });
  };

  return (command: Command): void => {
    switch (command) {
      case "cursorUp":
        moveCursor(activePane, -1);
        break;
      case "cursorDown":
        moveCursor(activePane, 1);
        break;
      case "pageUp":
        moveCursor(activePane, -PAGE_SIZE);
        break;
      case "pageDown":
        moveCursor(activePane, PAGE_SIZE);
        break;
      case "cursorFirst":
        moveCursor(activePane, -Infinity);
        break;
      case "cursorLast":
        moveCursor(activePane, Infinity);
        break;
      case "open":
        // selectedIndex が -1 のときは, 一覧の先頭にある `..` の行にカーソルがある.
        if (active.selectedIndex < 0) {
          navigation.handleParentDir(activePane);
        } else {
          openEntry(activePane, active.files[active.selectedIndex]);
        }
        break;
      case "openExternal":
        operations.openExternal();
        break;
      case "openEditor":
        operations.openEditor();
        break;
      case "parent":
        navigation.handleParentDir(activePane);
        break;
      case "goto": {
        const input = pathInputs.current[activePane];
        input?.focus();
        input?.select();
        break;
      }
      case "gotoHome":
        getHomeDir()
          .then((home) => loadDirectory(activePane, home))
          .catch((e) => reportError(String(e)));
        break;
      case "drives":
        navigation.showDrives();
        break;
      case "reload":
        navigation.handleReload();
        break;
      case "switchPane":
        switchPane();
        break;
      case "mkdir":
        operations.startMkdir();
        break;
      case "touch":
        operations.startTouch();
        break;
      case "rename":
        operations.startRename();
        break;
      case "copy":
        transfer.startCopy(false);
        break;
      case "copyConfirm":
        transfer.startCopy(true);
        break;
      case "copyToClipboard":
        transfer.copyToClipboard();
        break;
      case "pasteFromClipboard":
        transfer.pasteFromClipboard();
        break;
      case "copyFullPath":
        copyCursorText("fullPath");
        break;
      case "copyName":
        copyCursorText("name");
        break;
      case "duplicate":
        transfer.duplicateFile();
        break;
      case "move":
        transfer.startMove(false);
        break;
      case "moveConfirm":
        transfer.startMove(true);
        break;
      case "delete":
        transfer.startDelete(false);
        break;
      case "deletePermanent":
        transfer.startDelete(true);
        break;
      case "syncPane":
        navigation.handleSyncPane();
        break;
      case "preview":
        panels.togglePreview();
        break;
      case "info":
        panels.toggleInfo();
        break;
      case "log":
        panels.openLog();
        break;
      case "mark":
        marks.mark();
        break;
      case "unmark":
        marks.unmark();
        break;
      case "markAll":
        marks.markAll();
        break;
      case "unmarkAll":
        marks.unmarkAll();
        break;
      case "invertMarks":
        marks.invertMarks();
        break;
      case "markPattern":
        operations.openPrompt(
          "パターンでマーク (例: *.txt または /正規表現/)",
          marks.markPattern,
        );
        break;
      case "toggleHidden":
        setView(activePane, { showHidden: !active.showHidden });
        break;
      case "cycleSort":
        setView(activePane, { sort: nextSort(active.sort) });
        break;
      case "toggleDetails":
        setView(activePane, { showDetails: !active.showDetails });
        break;
      case "filter":
        setView(activePane, { filter: active.filter ?? "" });
        filterInputs.current[activePane]?.focus();
        break;
      case "cancel":
        // 絞り込み中でなければ, キャンセルできるものが無いので何もしない.
        if (active.filter !== null) {
          setView(activePane, { filter: null });
        }
        break;
      case "historyBack":
        navigation.handleHistory(-1);
        break;
      case "historyForward":
        navigation.handleHistory(1);
        break;
      case "historyList":
        panels.openHistoryList(activePane);
        break;
      case "bookmarks":
        panels.openBookmarks(activePane);
        break;
      case "addBookmark":
        bookmarks.toggleBookmark(active.currentPath);
        panels.openBookmarks(activePane);
        break;
      case "palette":
        panels.openPalette();
        break;
      case "help":
        panels.openHelp();
        break;
      case "openTerminal":
        openTerminal(active.currentPath).catch((e) => reportError(String(e)));
        break;
      case "externalCommand":
        operations.openPrompt(
          "外部コマンド実行 (例: xdg-open %f)",
          (command) => {
            const paths = targetsOf(active).map((f) => f.path);
            if (paths.length === 0) {
              reportError("対象の項目が選択されていません.");
              return;
            }
            runExternalCommand(command, paths).catch((e) =>
              reportError(String(e)),
            );
          },
        );
        break;
      case "cycleTheme":
        settings.cycleTheme();
        break;
      case "cycleFontSize":
        settings.cycleFontSize();
        break;
      case "resizeColumnWider":
        resizeNameColumn(COLUMN_STEP);
        break;
      case "resizeColumnNarrower":
        resizeNameColumn(-COLUMN_STEP);
        break;
      case "resetColumnWidths":
        settings.updatePaneColumnWidth(activePane, {});
        break;
      case "toggleTree":
        panels.toggleTree(activePane);
        break;
      case "quit":
        quitApp().catch((e) => log.warn("[React] 終了に失敗:", e));
        break;
    }
  };
}
