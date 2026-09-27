import type { ReactElement } from "react";
import type { FileEntry, PaneId, PaneState } from "../types";
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
  /** プレビューを表示するペイン. 表示しない場合は null. */
  previewPane: PaneId | null;
  /** プレビューの表示内容. `previewPane` のペインの代わりに表示される. */
  previewSlot: ReactElement | null;
  /** パス入力欄の要素を登録するハンドラー. */
  registerPathInput: (pane: PaneId, element: HTMLInputElement | null) => void;
  /** 絞り込み入力欄の要素を登録するハンドラー. */
  registerFilterInput: (pane: PaneId, element: HTMLInputElement | null) => void;
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
  previewPane,
  previewSlot,
  registerPathInput,
  registerFilterInput,
}: DualPaneContainerProps): ReactElement {
  const renderPane = (paneId: PaneId, state: PaneState): ReactElement =>
    paneId === previewPane && previewSlot ? (
      previewSlot
    ) : (
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
      />
    );

  return (
    <main className="dual-pane">
      {renderPane("left", leftPane)}
      {renderPane("right", rightPane)}
    </main>
  );
}
