import { useMemo, type ReactElement } from "react";
import type { FileEntry, PaneId, PaneState } from "../types";
import type {
  ColumnWidths,
  PaneColumnWidths,
} from "../../../features/settings/types";
import Pane, { type PaneProps } from "./Pane";

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
  /** 項目の右クリックのハンドラー (右クリックした位置を渡す). */
  onItemContextMenu: (
    pane: PaneId,
    index: number,
    file: FileEntry,
    x: number,
    y: number,
  ) => void;
  /** ペインの通常表示を差し替える内容 (プレビュー・詳細・ブックマーク一覧・履歴・ツリーなど). 無いペインは通常表示のまま. */
  overrides: Partial<Record<PaneId, ReactElement>>;
  /** パス入力欄の要素を登録するハンドラー. */
  registerPathInput: (pane: PaneId, element: HTMLInputElement | null) => void;
  /** 絞り込み入力欄の要素を登録するハンドラー. */
  registerFilterInput: (pane: PaneId, element: HTMLInputElement | null) => void;
  /** ペイン毎の列幅設定. */
  paneColumnWidths: PaneColumnWidths;
  /** 列幅が変更されたときのハンドラー. */
  onColumnWidthChange: (paneId: PaneId, widths: ColumnWidths) => void;
}

/** ペインごとに束ねたハンドラー (`Pane` へ渡す). */
type PaneHandlers = Pick<
  PaneProps,
  | "onActivate"
  | "onParent"
  | "onParentClick"
  | "onPathSubmit"
  | "onFilterChange"
  | "onItemClick"
  | "onItemOpen"
  | "onItemContextMenu"
  | "pathInputRef"
  | "filterInputRef"
>;

/**
 * ペインを引数に取るハンドラーを, 指定したペインに束ねます.
 *
 * @param paneId - 束ねるペイン.
 * @param props - コンテナのプロパティ.
 * @returns そのペインのハンドラー.
 */
function bindPane(
  paneId: PaneId,
  props: Pick<
    DualPaneContainerProps,
    | "onActivate"
    | "onParent"
    | "onParentClick"
    | "onPathSubmit"
    | "onFilterChange"
    | "onItemClick"
    | "onItemOpen"
    | "onItemContextMenu"
    | "registerPathInput"
    | "registerFilterInput"
  >,
): PaneHandlers {
  return {
    onActivate: () => props.onActivate(paneId),
    onParent: () => props.onParent(paneId),
    onParentClick: () => props.onParentClick(paneId),
    onPathSubmit: (value) => props.onPathSubmit(paneId, value),
    onFilterChange: (value) => props.onFilterChange(paneId, value),
    onItemClick: (index, file) => props.onItemClick(paneId, index, file),
    onItemOpen: (index, file) => props.onItemOpen(paneId, index, file),
    onItemContextMenu: (index, file, x, y) =>
      props.onItemContextMenu(paneId, index, file, x, y),
    pathInputRef: (element) => props.registerPathInput(paneId, element),
    filterInputRef: (element) => props.registerFilterInput(paneId, element),
  };
}

/**
 * 左右 2 つのペインを並べるコンテナ.
 *
 * ペインごとのハンドラーは, 渡されたハンドラーが変わらない限り作り直さない. 渡すハンドラーを変わらない
 * 関数にすれば, 片方のペインの操作で, もう片方のペイン (`memo` している) は描き直さない.
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
  onItemContextMenu,
  overrides,
  registerPathInput,
  registerFilterInput,
  paneColumnWidths,
  onColumnWidthChange,
}: DualPaneContainerProps): ReactElement {
  const [left, right] = useMemo(() => {
    const handlers = {
      onActivate,
      onParent,
      onParentClick,
      onPathSubmit,
      onFilterChange,
      onItemClick,
      onItemOpen,
      onItemContextMenu,
      registerPathInput,
      registerFilterInput,
    };
    return [bindPane("left", handlers), bindPane("right", handlers)];
  }, [
    onActivate,
    onParent,
    onParentClick,
    onPathSubmit,
    onFilterChange,
    onItemClick,
    onItemOpen,
    onItemContextMenu,
    registerPathInput,
    registerFilterInput,
  ]);

  const renderPane = (
    paneId: PaneId,
    state: PaneState,
    bound: PaneHandlers,
  ): ReactElement =>
    overrides[paneId] ?? (
      <Pane
        paneId={paneId}
        state={state}
        isActive={activePane === paneId}
        {...bound}
        paneColumnWidths={paneColumnWidths}
        onColumnWidthChange={onColumnWidthChange}
      />
    );

  return (
    <main className="dual-pane">
      {renderPane("left", leftPane, left)}
      {renderPane("right", rightPane, right)}
    </main>
  );
}
