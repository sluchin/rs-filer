import { useCallback, useRef, useState, type ReactElement } from "react";
import log from "loglevel";
import BookmarkPane from "./features/bookmarks/components/BookmarkPane";
import HistoryPane from "./features/explorer/components/HistoryPane";
import { useBookmarks } from "./features/bookmarks/hooks/useBookmarks";
import OperationLogDialog from "./components/OperationLogDialog";
import KeyHintBar from "./components/KeyHintBar";
import StatusBar from "./components/StatusBar";
import DualPaneContainer from "./features/explorer/components/DualPaneContainer";
import { useDiskSpace } from "./features/explorer/hooks/useDiskSpace";
import { useFileList } from "./features/explorer/hooks/useFileList";
import { useMarks } from "./features/explorer/hooks/useMarks";
import { useNavigation } from "./features/explorer/hooks/useNavigation";
import DriveSelector from "./features/explorer/components/DriveSelector";
import type { FileEntry, PaneId } from "./features/explorer/types";
import { nextSort, sortLabel } from "./features/explorer/view";
import CommandPalette from "./features/keybindings/components/CommandPalette";
import HelpDialog from "./features/keybindings/components/HelpDialog";
import { resolveCommandName } from "./features/keybindings/commandNames";
import { useUserKeymap } from "./features/keybindings/hooks/useUserKeymap";
import type { Command } from "./features/keybindings/types";
import { resolveKey } from "./features/keybindings/keymap";
import { useKeymap } from "./features/keybindings/useKeymap";
import BackgroundTaskBar from "./features/operations/components/BackgroundTaskBar";
import TaskProgressModal from "./features/operations/components/TaskProgressModal";
import { useTransfer } from "./features/operations/hooks/useTransfer";
import {
  copyTextToClipboard,
  getHomeDir,
  openTerminal,
  quitApp,
  runExternalCommand,
} from "./services/tauriApi";
import InfoPane from "./features/info/components/InfoPane";
import { useDirStats, useItemInfo } from "./features/info/hooks/useItemInfo";
import PreviewPane from "./features/preview/components/PreviewPane";
import { usePreview } from "./features/preview/hooks/usePreview";
import { useNotice } from "./hooks/useNotice";
import { useHistoryNav } from "./hooks/useHistoryNav";
import { useOperationLog } from "./hooks/useOperationLog";
import { useSettings } from "./hooks/useSettings";
import { DEFAULT_NAME_COLUMN_WIDTH } from "./features/settings/types";
import { targetsOf } from "./features/operations/hooks/useTransfer";
import OperationDialog from "./features/operations/components/OperationDialog";
import { useFileOperations } from "./features/operations/hooks/useFileOperations";
import { installLogForwarding } from "./services/logForwarder";
import TreePane from "./features/tree/components/TreePane";
import ContextMenu from "./components/ContextMenu";
import {
  copyChoicesOf,
  copyTextOf,
  type CopyKind,
  type CopyTarget,
} from "./features/explorer/copyText";

/** ページ送り (`PageUp` / `PageDown`) で動かす行数. */
const PAGE_SIZE = 10;

// バックエンドのログファイルにも残すため, コンソールへの出力に加えて IPC 経由で転送する.
installLogForwarding();
// 開発環境では debug 以上, 本番では info 以上 (最低限の情報, 警告, エラー) を出力.
if (import.meta.env.DEV) {
  log.setLevel("debug");
} else {
  log.setLevel("info");
}

/**
 * rsfiler のメインアプリケーションコンポーネント.
 *
 * 2 ペインによるディレクトリの閲覧・キーボード中心の操作 (カーソル移動, マーク, ソート・絞り込み,
 * 作成・名前変更・削除, 対向ペインへのコピー・移動, プレビュー・詳細, ブックマーク・移動履歴の一覧, ツリー表示,
 * コマンドパレット・ヘルプ, 外部アプリ・ターミナル・外部コマンド, テーマ・フォントサイズ) を
 * ひとまとめに提供します. キー入力の解決は `runCommand` に集約し, 各機能のフックへ振り分けます.
 *
 * @returns rsfiler のメインUI要素.
 */
export default function App(): ReactElement {
  const [activePane, setActivePane] = useState<PaneId>("left");
  const pathInputs = useRef<Record<PaneId, HTMLInputElement | null>>({
    left: null,
    right: null,
  });
  const filterInputs = useRef<Record<PaneId, HTMLInputElement | null>>({
    left: null,
    right: null,
  });
  const [bookmarkPanes, setBookmarkPanes] = useState<Record<PaneId, boolean>>({
    left: false,
    right: false,
  });
  const [historyPanes, setHistoryPanes] = useState<Record<PaneId, boolean>>({
    left: false,
    right: false,
  });
  const [treePanes, setTreePanes] = useState<Record<PaneId, boolean>>({
    left: false,
    right: false,
  });
  const [logOpen, setLogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewOn, setPreviewOn] = useState(false);
  const [infoOn, setInfoOn] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteValue, setPaletteValue] = useState("");
  const paletteHistory = useHistoryNav();
  const operationLog = useOperationLog();
  const { addLog } = operationLog;
  const logError = useCallback(
    (message: string): void => addLog("error", message),
    [addLog],
  );
  const logInfo = useCallback(
    (message: string): void => addLog("info", message),
    [addLog],
  );
  const { notice, notify } = useNotice(logInfo);
  // 右クリックのメニュー (フルパスや名前のコピー) の対象と位置. 開いていないときは null.
  const [copyMenu, setCopyMenu] = useState<{
    target: CopyTarget;
    x: number;
    y: number;
  } | null>(null);
  const keymap = useUserKeymap(logError);
  // 履歴一覧とブックマーク一覧は, 開くキー (キーマップで割り当てたもの) をもう一度押すと閉じる (トグル).
  // 一覧の表示中は, 全体のキー操作が無効なので, 一覧の側で判定する. 1 つのキーの割り当てだけを見る (`C-x` で始まる, 続きのキーの割り当ては見ない).
  const isHistoryListKey = useCallback(
    (e: KeyboardEvent): boolean =>
      resolveKey(e, null, keymap).command === "historyList",
    [keymap],
  );
  const isBookmarksKey = useCallback(
    (e: KeyboardEvent): boolean =>
      resolveKey(e, null, keymap).command === "bookmarks",
    [keymap],
  );
  const settings = useSettings();
  const bookmarks = useBookmarks();
  const {
    leftPane,
    rightPane,
    error,
    setError,
    updatePane,
    loadDirectory,
    setView,
    moveCursor,
  } = useFileList(logError);
  /** エラーを表示し, 操作ログにも記録する. */
  const reportError = useCallback(
    (message: string | null): void => {
      setError(message);
      if (message !== null) {
        logError(message);
      }
    },
    [setError, logError],
  );
  const navigation = useNavigation(
    activePane,
    leftPane,
    rightPane,
    loadDirectory,
    reportError,
  );
  const operations = useFileOperations(
    activePane,
    leftPane,
    rightPane,
    loadDirectory,
    reportError,
  );
  const transfer = useTransfer(
    activePane,
    leftPane,
    rightPane,
    updatePane,
    loadDirectory,
    reportError,
    notify,
    operations.openConfirm,
    operations.openPrompt,
    operations.openChoice,
  );
  const marks = useMarks(activePane, updatePane, moveCursor, reportError);
  const activeState = activePane === "left" ? leftPane : rightPane;
  const { handleEnter } = navigation;
  const { openExternal, openPath } = operations;

  /**
   * 指定したペインのカーソル位置の項目を開く. ディレクトリなら入り, ファイルなら外部アプリで開く.
   */
  const openEntry = useCallback(
    (pane: PaneId, file: FileEntry | undefined): void => {
      if (!file) {
        return;
      }
      if (file.is_dir) {
        handleEnter(pane, file);
      } else {
        openExternal();
      }
    },
    [handleEnter, openExternal],
  );

  /**
   * 対象のフルパスか名前を, 文字としてクリップボードへコピーする.
   */
  const copyText = useCallback(
    (target: CopyTarget, kind: CopyKind): void => {
      const text = copyTextOf(target, kind);
      copyTextToClipboard(text)
        .then(() => notify(`コピーしました: ${text}`))
        .catch((e) => reportError(String(e)));
    },
    [notify, reportError],
  );

  /**
   * アクティブなペインのカーソル位置の項目のフルパスか名前を, 文字としてコピーする (`..` の行と, 空の一覧では
   * コピーしない).
   */
  const copyCursorText = (kind: CopyKind): void => {
    const file = activeState.files[activeState.selectedIndex];
    if (!file) {
      reportError("対象の項目が選択されていません.");
      return;
    }
    copyText({ path: file.path, name: file.name, isDir: file.is_dir }, kind);
  };

  /** ペインを切り替える. */
  const switchPane = (): void =>
    setActivePane((p) => (p === "left" ? "right" : "left"));

  /** キー入力から解決されたコマンドを実行する. */
  const runCommand = (command: Command): void => {
    const active = activePane === "left" ? leftPane : rightPane;
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
        // プレビューと詳細は, どちらも反対側のペインに出すので, 一方を出すときは, もう一方を消す.
        setInfoOn(false);
        setPreviewOn((on) => !on);
        break;
      case "info":
        setPreviewOn(false);
        setInfoOn((on) => !on);
        break;
      case "log":
        setLogOpen(true);
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
        setHistoryPanes((p) => ({ ...p, [activePane]: true }));
        break;
      case "bookmarks":
        setBookmarkPanes((p) => ({ ...p, [activePane]: true }));
        break;
      case "addBookmark":
        bookmarks.toggleBookmark(active.currentPath);
        setBookmarkPanes((p) => ({ ...p, [activePane]: true }));
        break;
      case "palette":
        setPaletteValue("");
        setPaletteOpen(true);
        break;
      case "help":
        setHelpOpen(true);
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
      case "resizeColumnWider": {
        const paneWidths =
          settings.config.pane_column_widths?.[activePane] || {};
        const col = "col_name";
        const current = paneWidths.col_name ?? DEFAULT_NAME_COLUMN_WIDTH;
        settings.updatePaneColumnWidth(activePane, {
          ...paneWidths,
          [col]: Math.max(30, current + 10),
        });
        break;
      }
      case "resizeColumnNarrower": {
        const paneWidths =
          settings.config.pane_column_widths?.[activePane] || {};
        const col = "col_name";
        const current = paneWidths.col_name ?? DEFAULT_NAME_COLUMN_WIDTH;
        settings.updatePaneColumnWidth(activePane, {
          ...paneWidths,
          [col]: Math.max(30, current - 10),
        });
        break;
      }
      case "resetColumnWidths":
        settings.updatePaneColumnWidth(activePane, {});
        break;
      case "autoFitColumn":
        // 自動調整は未実装 (FileList コンポーネントで実装する予定).
        break;
      case "toggleTree":
        setTreePanes((p) => ({ ...p, [activePane]: !p[activePane] }));
        break;
      case "quit":
        quitApp().catch((e) => log.warn("[React] 終了に失敗:", e));
        break;
    }
  };

  /**
   * コマンドパレットで実行されたコマンド名を, コマンドとして実行する.
   */
  const executeCommandName = (name: string): void => {
    // コマンドパレットは常に有効なコマンド名を渡すので, command は必ず求まる.
    const command = resolveCommandName(name) as Command;
    paletteHistory.record(name);
    setPaletteOpen(false);
    runCommand(command);
  };

  // ダイアログ・パレット・ブックマークや履歴の一覧など, 文字入力や別の操作を待っている間は,
  // グローバルなキー操作 (カーソル移動など) を無効にする. アクティブなペインのみを見るのは,
  // 一覧をブックマーク・履歴に差し替えていても, 反対側のペインは通常どおり操作できるようにするため.
  const pending = useKeymap(
    runCommand,
    operations.dialog === null &&
      navigation.drives === null &&
      !bookmarkPanes[activePane] &&
      !historyPanes[activePane] &&
      !treePanes[activePane] &&
      !logOpen &&
      !paletteOpen &&
      !helpOpen &&
      copyMenu === null &&
      (transfer.task === null || transfer.background),
    keymap,
  );

  /**
   * 項目クリック時に, ペインをアクティブにしてカーソルを移す.
   */
  const handleItemClick = useCallback(
    (pane: PaneId, index: number): void => {
      setActivePane(pane);
      updatePane(pane, (p) => ({ ...p, selectedIndex: index }));
    },
    [updatePane],
  );

  /**
   * 項目の右クリック時に, その項目にカーソルを移して, コピーのメニューを開く.
   */
  const handleItemContextMenu = useCallback(
    (pane: PaneId, index: number, file: FileEntry, x: number, y: number) => {
      handleItemClick(pane, index);
      setCopyMenu({
        target: { path: file.path, name: file.name, isDir: file.is_dir },
        x,
        y,
      });
    },
    [handleItemClick],
  );

  /**
   * 項目ダブルクリック時に, その項目を開く.
   */
  const handleItemOpen = useCallback(
    (pane: PaneId, index: number, file: FileEntry): void => {
      handleItemClick(pane, index);
      openEntry(pane, file);
    },
    [handleItemClick, openEntry],
  );

  const disk = useDiskSpace(activeState.currentPath);
  const cursorFile = activeState.files[activeState.selectedIndex];
  // 詳細は, カーソル位置の項目 (`..` の行や空のディレクトリでは, 開いているディレクトリ) について表示する.
  const infoState = useItemInfo(
    infoOn ? (cursorFile?.path ?? activeState.currentPath) : null,
  );
  const dirStatsState = useDirStats(
    infoOn && infoState.status === "ready" && infoState.info.kind === "dir"
      ? infoState.info.path
      : null,
  );
  const previewState = usePreview(
    previewOn && cursorFile && !cursorFile.is_dir ? cursorFile.path : null,
  );

  /**
   * ペインの通常表示を差し替える内容.
   * プレビュー・詳細は対向ペイン, ブックマーク・履歴・ツリーは要求したペイン (どちらも左右両方あり得る) に出す.
   */
  const paneOverrides: Partial<Record<PaneId, ReactElement>> = {};
  if (previewOn) {
    paneOverrides[activePane === "left" ? "right" : "left"] = (
      <PreviewPane name={cursorFile?.name ?? ""} state={previewState} />
    );
  }
  if (infoOn) {
    paneOverrides[activePane === "left" ? "right" : "left"] = (
      <InfoPane info={infoState} stats={dirStatsState} />
    );
  }
  (["left", "right"] as const).forEach((paneId) => {
    if (!bookmarkPanes[paneId]) {
      return;
    }
    paneOverrides[paneId] = (
      <BookmarkPane
        paneId={paneId}
        isActive={activePane === paneId}
        bookmarks={bookmarks.bookmarks}
        onActivate={() => setActivePane(paneId)}
        onSelect={(path) => {
          setBookmarkPanes((p) => ({ ...p, [paneId]: false }));
          loadDirectory(paneId, path);
        }}
        onRemove={bookmarks.removeBookmark}
        onCancel={() => setBookmarkPanes((p) => ({ ...p, [paneId]: false }))}
        onSwitchPane={switchPane}
        isToggleKey={isBookmarksKey}
      />
    );
  });
  (["left", "right"] as const).forEach((paneId) => {
    if (!historyPanes[paneId]) {
      return;
    }
    const state = paneId === "left" ? leftPane : rightPane;
    paneOverrides[paneId] = (
      <HistoryPane
        paneId={paneId}
        isActive={activePane === paneId}
        onActivate={() => setActivePane(paneId)}
        history={state.history}
        historyIndex={state.historyIndex}
        onSelect={(path, index) => {
          setHistoryPanes((p) => ({ ...p, [paneId]: false }));
          loadDirectory(paneId, path, { historyIndex: index });
        }}
        onCancel={() => setHistoryPanes((p) => ({ ...p, [paneId]: false }))}
        onSwitchPane={switchPane}
        isToggleKey={isHistoryListKey}
      />
    );
  });
  (["left", "right"] as const).forEach((paneId) => {
    if (!treePanes[paneId]) {
      return;
    }
    const state = paneId === "left" ? leftPane : rightPane;
    paneOverrides[paneId] = (
      <TreePane
        paneId={paneId}
        rootPath={state.currentPath}
        showHidden={state.showHidden}
        isActive={activePane === paneId}
        onActivate={() => setActivePane(paneId)}
        onSelect={(path, isDir) => {
          if (!isDir) {
            // ファイルは, ツリーを残したまま, 外部アプリで開く.
            openPath(path);
            return;
          }
          setTreePanes((p) => ({ ...p, [paneId]: false }));
          loadDirectory(paneId, path);
        }}
        keysEnabled={operations.dialog === null && copyMenu === null}
        onCreateDirectory={operations.startMkdirAt}
        onRename={operations.startRenameAt}
        onDelete={(path, name, permanent, onDone) =>
          transfer.startDeletePaths([{ path, name }], permanent, onDone)
        }
        onOpenExternal={openPath}
        onCopyMenu={(target, x, y) => {
          setActivePane(paneId);
          setCopyMenu({ target, x, y });
        }}
        onCopyText={copyText}
        onCancel={() => setTreePanes((p) => ({ ...p, [paneId]: false }))}
        onSwitchPane={switchPane}
      />
    );
  });

  return (
    <div
      className="app"
      data-theme={settings.config.theme}
      data-font-size={settings.config.font_size}
    >
      <div className="app-body">
        <DualPaneContainer
          activePane={activePane}
          leftPane={leftPane}
          rightPane={rightPane}
          onActivate={setActivePane}
          onParent={navigation.handleParentDir}
          onParentClick={(pane) => handleItemClick(pane, -1)}
          onPathSubmit={(pane, value) => loadDirectory(pane, value)}
          onFilterChange={(pane, value) => setView(pane, { filter: value })}
          onItemClick={handleItemClick}
          onItemOpen={handleItemOpen}
          onItemContextMenu={handleItemContextMenu}
          overrides={paneOverrides}
          registerPathInput={(pane, element) => {
            pathInputs.current[pane] = element;
          }}
          registerFilterInput={(pane, element) => {
            filterInputs.current[pane] = element;
          }}
          paneColumnWidths={{
            left: settings.config.pane_column_widths?.left ?? {},
            right: settings.config.pane_column_widths?.right ?? {},
          }}
          onColumnWidthChange={(paneId, widths) =>
            settings.updatePaneColumnWidth(paneId, widths)
          }
        />
      </div>
      {/* コマンド入力・作成・名前変更・削除確認・ドライブ選択は,
          ダイアログではなく画面下部のミニバッファ (xyzzy/Emacs 風) に表示する.
          ブックマーク・履歴・ツリーは, ペインの表示そのものを差し替える (paneOverrides). */}
      {operations.dialog && (
        <OperationDialog
          dialog={operations.dialog}
          onClose={operations.closeDialog}
        />
      )}
      {navigation.drives && (
        <DriveSelector
          drives={navigation.drives}
          onSelect={navigation.selectDrive}
          onClose={navigation.closeDrives}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          value={paletteValue}
          onChange={setPaletteValue}
          onExecute={executeCommandName}
          onHistory={(delta) => {
            const found = paletteHistory.move(delta, paletteValue);
            if (found !== null) {
              setPaletteValue(found);
            }
          }}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {copyMenu && (
        <ContextMenu
          x={copyMenu.x}
          y={copyMenu.y}
          items={copyChoicesOf(copyMenu.target).map(({ kind, label }) => ({
            label,
            onSelect: () => copyText(copyMenu.target, kind),
          }))}
          onClose={() => setCopyMenu(null)}
        />
      )}
      {helpOpen && (
        <HelpDialog keymap={keymap} onClose={() => setHelpOpen(false)} />
      )}
      <KeyHintBar mode={treePanes[activePane] ? "tree" : "list"} />
      {transfer.task && transfer.background && (
        <BackgroundTaskBar task={transfer.task} onCancel={transfer.cancel} />
      )}
      <StatusBar
        error={error}
        // プレフィクスキー入力中は, 続きを待っていることが分かるよう通知の末尾に付け足す.
        notice={pending ? `${notice ?? ""} [${pending}-]`.trim() : notice}
        currentName={
          activeState.selectedIndex < 0 ? ".." : (cursorFile?.name ?? "")
        }
        info={[
          sortLabel(activeState.sort),
          `マーク: ${activeState.marks.length}`,
          ...(activeState.showHidden ? [] : ["隠しファイル非表示"]),
        ].join(" / ")}
        disk={disk}
      />
      {transfer.task && !transfer.background && (
        <TaskProgressModal
          task={transfer.task}
          onCancel={transfer.cancel}
          onBackground={transfer.sendToBackground}
        />
      )}
      {logOpen && (
        <OperationLogDialog
          entries={operationLog.entries}
          onClose={() => setLogOpen(false)}
        />
      )}
    </div>
  );
}
