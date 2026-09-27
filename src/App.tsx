import { useCallback, useRef, useState, type ReactElement } from "react";
import log from "loglevel";
import BookmarkMenu from "./features/bookmarks/components/BookmarkMenu";
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
import type { Command } from "./features/keybindings/types";
import { useKeymap } from "./features/keybindings/useKeymap";
import TaskProgressModal from "./features/operations/components/TaskProgressModal";
import { useTransfer } from "./features/operations/hooks/useTransfer";
import PreviewPane from "./features/preview/components/PreviewPane";
import { usePreview } from "./features/preview/hooks/usePreview";
import { useNotice } from "./hooks/useNotice";
import { useOperationLog } from "./hooks/useOperationLog";
import OperationDialog from "./features/operations/components/OperationDialog";
import { useFileOperations } from "./features/operations/hooks/useFileOperations";

// 開発環境では debug 以上, 本番では warn 以上を出力.
if (import.meta.env.DEV) {
  log.setLevel("debug");
} else {
  log.setLevel("warn");
}

/**
 * rsfiler のメインアプリケーションコンポーネント.
 * 2ペインによるディレクトリの閲覧, キーボードによるカーソル移動・ディレクトリ移動, および
 * ファイル・ディレクトリの作成・名前変更・削除・外部アプリで開く操作を提供します.
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
  const [bookmarkOpen, setBookmarkOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [previewOn, setPreviewOn] = useState(false);
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
  );
  const marks = useMarks(activePane, updatePane, moveCursor, reportError);
  const { handleEnter } = navigation;
  const { openExternal } = operations;

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
      case "open":
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
        setPreviewOn((on) => !on);
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
      case "bookmarks":
        setBookmarkOpen(true);
        break;
      case "addBookmark":
        bookmarks.toggleBookmark(active.currentPath);
        setBookmarkOpen(true);
        break;
    }
  };

  useKeymap(
    runCommand,
    operations.dialog === null &&
      navigation.drives === null &&
      !bookmarkOpen &&
      !logOpen &&
      transfer.task === null,
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
   * 項目ダブルクリック時に, その項目を開く.
   */
  const handleItemOpen = useCallback(
    (pane: PaneId, index: number, file: FileEntry): void => {
      handleItemClick(pane, index);
      openEntry(pane, file);
    },
    [handleItemClick, openEntry],
  );

  const activeState = activePane === "left" ? leftPane : rightPane;
  const disk = useDiskSpace(activeState.currentPath);
  const cursorFile = activeState.files[activeState.selectedIndex];
  const previewState = usePreview(
    previewOn && cursorFile && !cursorFile.is_dir ? cursorFile.path : null,
  );

  return (
    <div className="app">
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
        previewPane={
          previewOn ? (activePane === "left" ? "right" : "left") : null
        }
        previewSlot={
          previewOn ? (
            <PreviewPane name={cursorFile?.name ?? ""} state={previewState} />
          ) : null
        }
        registerPathInput={(pane, element) => {
          pathInputs.current[pane] = element;
        }}
        registerFilterInput={(pane, element) => {
          filterInputs.current[pane] = element;
        }}
      />
      <KeyHintBar />
      <StatusBar
        error={error}
        notice={notice}
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
      {operations.dialog && (
        <OperationDialog
          dialog={operations.dialog}
          onClose={operations.closeDialog}
        />
      )}
      {transfer.task && (
        <TaskProgressModal task={transfer.task} onCancel={transfer.cancel} />
      )}
      {logOpen && (
        <OperationLogDialog
          entries={operationLog.entries}
          onClose={() => setLogOpen(false)}
        />
      )}
      {bookmarkOpen && (
        <BookmarkMenu
          bookmarks={bookmarks.bookmarks}
          currentPath={activeState.currentPath}
          onSelect={(path) => {
            setBookmarkOpen(false);
            loadDirectory(activePane, path);
          }}
          onToggleCurrent={() =>
            bookmarks.toggleBookmark(activeState.currentPath)
          }
          onRemove={bookmarks.removeBookmark}
          onClose={() => setBookmarkOpen(false)}
        />
      )}
      {navigation.drives && (
        <DriveSelector
          drives={navigation.drives}
          onSelect={navigation.selectDrive}
          onClose={navigation.closeDrives}
        />
      )}
    </div>
  );
}
