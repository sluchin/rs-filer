import { useCallback, useRef, useState, type ReactElement } from "react";
import log from "loglevel";
import KeyHintBar from "./components/KeyHintBar";
import StatusBar from "./components/StatusBar";
import DualPaneContainer from "./features/explorer/components/DualPaneContainer";
import { useDiskSpace } from "./features/explorer/hooks/useDiskSpace";
import { useFileList } from "./features/explorer/hooks/useFileList";
import { useNavigation } from "./features/explorer/hooks/useNavigation";
import DriveSelector from "./features/explorer/components/DriveSelector";
import type { FileEntry, PaneId } from "./features/explorer/types";
import type { Command } from "./features/keybindings/types";
import { useKeymap } from "./features/keybindings/useKeymap";
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
  const {
    leftPane,
    rightPane,
    error,
    setError,
    updatePane,
    loadDirectory,
    moveCursor,
  } = useFileList();
  const navigation = useNavigation(
    activePane,
    leftPane,
    rightPane,
    loadDirectory,
    setError,
  );
  const operations = useFileOperations(
    activePane,
    leftPane,
    rightPane,
    loadDirectory,
    setError,
  );
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
        openEntry(activePane, active.files[active.selectedIndex]);
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
        operations.copyToOpposite();
        break;
      case "delete":
        operations.startDelete(false);
        break;
      case "deletePermanent":
        operations.startDelete(true);
        break;
    }
  };

  useKeymap(
    runCommand,
    operations.dialog === null && navigation.drives === null,
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

  return (
    <div className="app">
      <DualPaneContainer
        activePane={activePane}
        leftPane={leftPane}
        rightPane={rightPane}
        onActivate={setActivePane}
        onParent={navigation.handleParentDir}
        onPathChange={(pane, value) =>
          updatePane(pane, (p) => ({ ...p, currentPath: value }))
        }
        onPathSubmit={(pane) =>
          loadDirectory(
            pane,
            (pane === "left" ? leftPane : rightPane).currentPath,
          )
        }
        onItemClick={handleItemClick}
        onItemOpen={handleItemOpen}
        registerPathInput={(pane, element) => {
          pathInputs.current[pane] = element;
        }}
      />
      <KeyHintBar />
      <StatusBar
        error={error}
        currentName={activeState.files[activeState.selectedIndex]?.name ?? ""}
        disk={disk}
      />
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
    </div>
  );
}
