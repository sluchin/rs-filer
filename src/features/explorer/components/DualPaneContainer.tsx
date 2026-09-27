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
  /** パス入力の変更ハンドラー. */
  onPathChange: (pane: PaneId, value: string) => void;
  /** パス入力の確定ハンドラー. */
  onPathSubmit: (pane: PaneId) => void;
  /** 項目クリックのハンドラー. */
  onItemClick: (pane: PaneId, index: number, file: FileEntry) => void;
  /** 項目ダブルクリックのハンドラー. */
  onItemOpen: (pane: PaneId, index: number, file: FileEntry) => void;
  /** パス入力欄の要素を登録するハンドラー. */
  registerPathInput: (pane: PaneId, element: HTMLInputElement | null) => void;
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
  onPathChange,
  onPathSubmit,
  onItemClick,
  onItemOpen,
  registerPathInput,
}: DualPaneContainerProps): ReactElement {
  const renderPane = (paneId: PaneId, state: PaneState): ReactElement => (
    <Pane
      paneId={paneId}
      state={state}
      isActive={activePane === paneId}
      onActivate={() => onActivate(paneId)}
      onParent={() => onParent(paneId)}
      onPathChange={(value) => onPathChange(paneId, value)}
      onPathSubmit={() => onPathSubmit(paneId)}
      onItemClick={(index, file) => onItemClick(paneId, index, file)}
      onItemOpen={(index, file) => onItemOpen(paneId, index, file)}
      pathInputRef={(element) => registerPathInput(paneId, element)}
    />
  );

  return (
    <main className="dual-pane">
      {renderPane("left", leftPane)}
      {renderPane("right", rightPane)}
    </main>
  );
}
