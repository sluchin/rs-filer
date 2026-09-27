import { useEffect, type ReactElement } from "react";
import type { FileEntry } from "../types";
import { useVirtualRows } from "../hooks/useVirtualRows";
import FileIcon from "./FileIcon";
import FileItem from "./FileItem";

/**
 * FileList コンポーネントのプロパティ.
 */
interface FileListProps {
  /** 表示するエントリ一覧. */
  files: FileEntry[];
  /** カーソル位置のインデックス. -1 は親ディレクトリの行 (`..`). */
  selectedIndex: number;
  /** このペインがアクティブかどうか. */
  isActive: boolean;
  /** マークされているエントリのパス. */
  marks: string[];
  /** 詳細 (サイズ・更新日時・属性) の列を表示するかどうか. */
  showDetails: boolean;
  /** 親ディレクトリへ移動できるかどうか. true の場合は先頭に `..` の行を表示する. */
  hasParent: boolean;
  /** `..` の行をダブルクリックしたときのハンドラー. */
  onParent: () => void;
  /** `..` の行をクリックしたときのハンドラー. */
  onParentClick: () => void;
  /** 項目クリック時のハンドラー. */
  onItemClick: (index: number, file: FileEntry) => void;
  /** 項目ダブルクリック時のハンドラー. */
  onItemOpen: (index: number, file: FileEntry) => void;
}

/**
 * 親ディレクトリの行 (`..`). ファイルの行と同様に, カーソルを置ける.
 *
 * @param props - カーソルの状態とハンドラー.
 * @returns 行のReact要素.
 */
function ParentRow({
  cursor,
  measureRef,
  onClick,
  onDoubleClick,
}: {
  cursor: "active" | "inactive" | "none";
  measureRef: (element: HTMLElement | null) => void;
  onClick: () => void;
  onDoubleClick: () => void;
}): ReactElement {
  return (
    <li
      ref={measureRef}
      className="file-row"
      data-cursor={cursor}
      aria-current={cursor === "active" ? "true" : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <FileIcon kind="parent" />
      <span className="col-name">..</span>
    </li>
  );
}

/**
 * ファイル一覧. 列見出しと各行を表示します.
 *
 * 行数が多いときは, 画面に映る分の前後だけを描画する仮想スクロールで表示します
 * (コンテナや行の高さが測れるまでは, これまでどおりすべての行を描画します).
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 一覧のReact要素.
 */
export default function FileList({
  files,
  selectedIndex,
  isActive,
  marks,
  showDetails,
  hasParent,
  onParent,
  onParentClick,
  onItemClick,
  onItemOpen,
}: FileListProps): ReactElement {
  const totalCount = files.length + (hasParent ? 1 : 0);
  const {
    containerRef,
    measureRowRef,
    start,
    end,
    paddingTop,
    paddingBottom,
    scrollToIndex,
  } = useVirtualRows(totalCount);
  // カーソルの, 「..」を含めた行番号 (仮想スクロールの座標系).
  const cursorRow = hasParent ? selectedIndex + 1 : selectedIndex;

  useEffect(() => {
    scrollToIndex(cursorRow);
  }, [cursorRow, scrollToIndex]);

  const rows: ReactElement[] = [];
  for (let row = start; row < end; row++) {
    const rowMeasureRef = row === start ? measureRowRef : () => {};
    if (hasParent && row === 0) {
      rows.push(
        <ParentRow
          key=".."
          cursor={
            selectedIndex !== -1 ? "none" : isActive ? "active" : "inactive"
          }
          measureRef={rowMeasureRef}
          onClick={onParentClick}
          onDoubleClick={onParent}
        />,
      );
      continue;
    }
    const idx = hasParent ? row - 1 : row;
    const file = files[idx];
    rows.push(
      <FileItem
        key={file.path}
        file={file}
        cursor={
          selectedIndex !== idx ? "none" : isActive ? "active" : "inactive"
        }
        marked={marks.includes(file.path)}
        showDetails={showDetails}
        measureRef={rowMeasureRef}
        onClick={() => onItemClick(idx, file)}
        onDoubleClick={() => onItemOpen(idx, file)}
      />,
    );
  }

  return (
    <div className="file-list">
      <div className="file-header">
        <span className="col-name">ファイル名</span>
        {showDetails && (
          <>
            <span className="col-size">サイズ</span>
            <span className="col-date">更新日時</span>
            <span className="col-attr">属性</span>
          </>
        )}
      </div>
      <ul className="file-rows" ref={containerRef}>
        {paddingTop > 0 && (
          <li aria-hidden="true" style={{ height: paddingTop }} />
        )}
        {rows}
        {paddingBottom > 0 && (
          <li aria-hidden="true" style={{ height: paddingBottom }} />
        )}
      </ul>
    </div>
  );
}
