import type { ReactElement } from "react";
import type { FileEntry, PaneId, PaneState } from "../types";
import { getParentPath } from "../../../utils/path";
import FileList from "./FileList";
import PathBar from "./PathBar";

/**
 * Pane コンポーネントのプロパティ.
 */
interface PaneProps {
  /** ペイン識別子. */
  paneId: PaneId;
  /** ペインの状態. */
  state: PaneState;
  /** アクティブかどうか. */
  isActive: boolean;
  /** ペインがクリックされたときのハンドラー. */
  onActivate: () => void;
  /** 親ディレクトリへ移動するハンドラー. */
  onParent: () => void;
  /** パス入力の変更ハンドラー. */
  onPathChange: (value: string) => void;
  /** パス入力の確定ハンドラー. */
  onPathSubmit: () => void;
  /** 項目クリックのハンドラー. */
  onItemClick: (index: number, file: FileEntry) => void;
  /** 項目ダブルクリックのハンドラー. */
  onItemOpen: (index: number, file: FileEntry) => void;
  /** パス入力欄の要素を受け取る ref コールバック. */
  pathInputRef: (element: HTMLInputElement | null) => void;
}

/**
 * 1 つのペイン (パス入力・ファイル一覧).
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ペインのReact要素.
 */
export default function Pane({
  paneId,
  state,
  isActive,
  onActivate,
  onParent,
  onPathChange,
  onPathSubmit,
  onItemClick,
  onItemOpen,
  pathInputRef,
}: PaneProps): ReactElement {
  return (
    <div
      role="region"
      aria-label={`${paneId} pane`}
      data-active={isActive}
      onClick={onActivate}
      className="pane"
    >
      <PathBar
        path={state.currentPath}
        onChange={onPathChange}
        onSubmit={onPathSubmit}
        inputRef={pathInputRef}
        label={`${paneId} path`}
      />
      <FileList
        files={state.files}
        selectedIndex={state.selectedIndex}
        isActive={isActive}
        hasParent={getParentPath(state.currentPath) !== null}
        onParent={onParent}
        onItemClick={onItemClick}
        onItemOpen={onItemOpen}
      />
    </div>
  );
}
