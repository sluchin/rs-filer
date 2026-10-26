import { memo, type ReactElement } from "react";
import type { FileEntry, PaneId, PaneState } from "../types";
import type {
  ColumnWidths,
  PaneColumnWidths,
} from "../../../features/settings/types";
import { getParentPath } from "../../../utils/path";
import QuickFilterBar from "../../search/components/QuickFilterBar";
import FileList from "./FileList";
import PathBar from "./PathBar";

/**
 * Pane コンポーネントのプロパティ.
 */
export interface PaneProps {
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
  /** パス入力の確定ハンドラー. 入力された文字列が渡される. */
  onPathSubmit: (value: string) => void;
  /** 絞り込み文字列の変更ハンドラー. null で絞り込みを解除する. */
  onFilterChange: (value: string | null) => void;
  /** `..` の行クリックのハンドラー. */
  onParentClick: () => void;
  /** 項目クリックのハンドラー. */
  onItemClick: (index: number, file: FileEntry) => void;
  /** 項目ダブルクリックのハンドラー. */
  onItemOpen: (index: number, file: FileEntry) => void;
  /** 項目の右クリックのハンドラー (右クリックした位置を渡す). */
  onItemContextMenu: (
    index: number,
    file: FileEntry,
    x: number,
    y: number,
  ) => void;
  /** パス入力欄の要素を受け取る ref コールバック. */
  pathInputRef: (element: HTMLInputElement | null) => void;
  /** 絞り込み入力欄の要素を受け取る ref コールバック. */
  filterInputRef: (element: HTMLInputElement | null) => void;
  /** ペイン毎の列幅設定. */
  paneColumnWidths: PaneColumnWidths;
  /** 列幅が変更されたときのハンドラー (paneId と幅を渡す). */
  onColumnWidthChange: (paneId: PaneId, widths: ColumnWidths) => void;
}

/**
 * 1 つのペイン (パス入力・ファイル一覧).
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ペインのReact要素.
 */
function Pane({
  paneId,
  state,
  isActive,
  onActivate,
  onParent,
  onParentClick,
  onPathSubmit,
  onFilterChange,
  onItemClick,
  onItemOpen,
  onItemContextMenu,
  pathInputRef,
  filterInputRef,
  paneColumnWidths,
  onColumnWidthChange,
}: PaneProps): ReactElement {
  const columnWidths = paneColumnWidths[paneId];
  return (
    <div
      role="region"
      aria-label={`${paneId} pane`}
      data-active={isActive}
      onClick={onActivate}
      className="pane"
    >
      <PathBar
        key={state.currentPath}
        path={state.currentPath}
        onSubmit={onPathSubmit}
        inputRef={pathInputRef}
        label={`${paneId} path`}
      />
      {state.filter !== null && (
        <QuickFilterBar
          value={state.filter}
          onChange={onFilterChange}
          onCancel={() => onFilterChange(null)}
          inputRef={filterInputRef}
          label={`${paneId} filter`}
        />
      )}
      <FileList
        files={state.files}
        selectedIndex={state.selectedIndex}
        isActive={isActive}
        marks={state.marks}
        flags={state.flags}
        showDetails={state.showDetails}
        hasParent={getParentPath(state.currentPath) !== null}
        onParent={onParent}
        onParentClick={onParentClick}
        onItemClick={onItemClick}
        onItemOpen={onItemOpen}
        onItemContextMenu={onItemContextMenu}
        columnWidths={columnWidths}
        onColumnWidthChange={(widths) => onColumnWidthChange(paneId, widths)}
      />
    </div>
  );
}

/**
 * 1 つのペイン. プロパティが変わらなければ描き直さない (反対側のペインの操作で, 一覧を描き直さないため).
 */
export default memo(Pane);
