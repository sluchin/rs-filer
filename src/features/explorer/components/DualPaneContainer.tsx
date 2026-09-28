import type { ReactElement } from "react";
import type { FileEntry, PaneId, PaneState } from "../types";
import type { ColumnWidths } from "../../../features/settings/types";
import Pane from "./Pane";

/**
 * DualPaneContainer コンポーネントのプロパティ.
 */
interface DualPaneContainerProps {
  /** アクティブなペイン. */
  activePane: PaneId;
  /** 左ペインの状態. */
  leftPane: PaneState;
  /** 右ペインの状態. */
  rightPane: PaneState;
  /** ペインをアクティブにするハンドラー. */
  onActivate: (pane: PaneId) => void;
  /** 親ディレクトリへ移動するハンドラー. */
  onParent: (pane: PaneId) => void;
  /** パス入力の確定ハンドラー. */
  onPathSubmit: (pane: PaneId, value: string) => void;
  /** 絞り込み文字列の変更ハンドラー. null で絞り込みを解除する. */
  onFilterChange: (pane: PaneId, value: string | null) => void;
  /** `..` の行クリックのハンドラー. */
  onParentClick: (pane: PaneId) => void;
  /** 項目クリックのハンドラー. */
  onItemClick: (pane: PaneId, index: number, file: FileEntry) => void;
  /** 項目ダブルクリックのハンドラー. */
  onItemOpen: (pane: PaneId, index: number, file: FileEntry) => void;
  /** ペインの通常表示を差し替える内容 (プレビュー・ブックマーク一覧など). 無いペインは通常表示のまま. */
  overrides: Partial<Record<PaneId, ReactElement>>;
  /** パス入力欄の要素を登録するハンドラー. */
  registerPathInput: (pane: PaneId, element: HTMLInputElement | null) => void;
  /** 絞り込み入力欄の要素を登録するハンドラー. */
  registerFilterInput: (pane: PaneId, element: HTMLInputElement | null) => void;
  /** ペイン毎の列幅設定. */
  paneColumnWidths?: Record<"left" | "right", ColumnWidths>;
  /** 列幅が変更されたときのハンドラー. */
  onColumnWidthChange?: (paneId: PaneId, widths: ColumnWidths) => void;
}

/**
 * 左右 2 つのペインを並べるコンテナ.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 2 ペインのReact要素.
 */
export default function DualPaneContainer({
  activePane,
  leftPane,
  rightPane,
  onActivate,
  onParent,
  onParentClick,
  onPathSubmit,
  onFilterChange,
  onItemClick,
  onItemOpen,
  overrides,
  registerPathInput,
  registerFilterInput,
  paneColumnWidths,
  onColumnWidthChange,
}: DualPaneContainerProps): ReactElement {
  const renderPane = (paneId: PaneId, state: PaneState): ReactElement =>
    overrides[paneId] ?? (
      <Pane
        paneId={paneId}
        state={state}
        isActive={activePane === paneId}
        onActivate={() => onActivate(paneId)}
        onParent={() => onParent(paneId)}
        onParentClick={() => onParentClick(paneId)}
        onPathSubmit={(value) => onPathSubmit(paneId, value)}
        onFilterChange={(value) => onFilterChange(paneId, value)}
        onItemClick={(index, file) => onItemClick(paneId, index, file)}
        onItemOpen={(index, file) => onItemOpen(paneId, index, file)}
        pathInputRef={(element) => registerPathInput(paneId, element)}
        filterInputRef={(element) => registerFilterInput(paneId, element)}
        paneColumnWidths={paneColumnWidths}
        onColumnWidthChange={onColumnWidthChange}
      />
    );

  return (
    <main className="dual-pane">
      {renderPane("left", leftPane)}
      {renderPane("right", rightPane)}
    </main>
  );
}
