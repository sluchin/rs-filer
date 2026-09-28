import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { FileEntry } from "../types";
import type { ColumnWidths } from "../../../features/settings/types";
import { formatAttributes } from "../../../utils/formatters";
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
  /** 列幅設定. */
  columnWidths?: ColumnWidths;
  /** 列幅が変更されたときのハンドラー. */
  onColumnWidthChange?: (widths: ColumnWidths) => void;
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
  colNameStyle,
}: {
  cursor: "active" | "inactive" | "none";
  measureRef: (element: HTMLElement | null) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  colNameStyle?: React.CSSProperties;
  colSizeStyle?: React.CSSProperties;
  colDateStyle?: React.CSSProperties;
  colAttrStyle?: React.CSSProperties;
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
      <span className="col-name" style={colNameStyle}>
        ..
      </span>
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
  columnWidths = {},
  onColumnWidthChange,
}: FileListProps): ReactElement {
  const [draggingColumn, setDraggingColumn] = useState<
    "col_name" | "col_size" | "col_date" | "col_attr" | null
  >(null);
  const [dragStartX, setDragStartX] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

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

  // テキスト幅を測定します.
  const measureTextWidth = useCallback((text: string): number => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return 0;
    const style = window.getComputedStyle(document.body);
    context.font = `${style.fontSize} ${style.fontFamily}`;
    return context.measureText(text).width;
  }, []);

  // 列の最大幅を計算します.
  const getAutoFitWidth = useCallback(
    (column: "col_name" | "col_size" | "col_date" | "col_attr"): number => {
      let maxWidth = 0;
      if (column === "col_name") {
        maxWidth = Math.max(
          measureTextWidth("ファイル名") + 8,
          ...files.map((f) => measureTextWidth(f.name) + 8),
        );
      } else if (column === "col_size") {
        maxWidth = Math.max(
          measureTextWidth("サイズ") + 8,
          ...files.map((f) => measureTextWidth(f.size?.toString() ?? "") + 8),
        );
      } else if (column === "col_date") {
        maxWidth = Math.max(
          measureTextWidth("更新日時") + 8,
          ...files.map(
            (f) => measureTextWidth(f.modified?.toString() ?? "") + 8,
          ),
        );
      } else if (column === "col_attr") {
        maxWidth = Math.max(
          measureTextWidth("属性") + 8,
          ...files.map((f) => measureTextWidth(formatAttributes(f)) + 8),
        );
      }
      return Math.max(maxWidth, 30);
    },
    [files, measureTextWidth],
  );

  // 各列のスタイル.
  const colNameStyle: React.CSSProperties = columnWidths.col_name
    ? {
        width: `${columnWidths.col_name}px`,
        flex: "none",
      }
    : {
        flex: 1,
      };

  const colSizeStyle: React.CSSProperties | undefined = columnWidths.col_size
    ? {
        width: `${columnWidths.col_size}px`,
        flex: "none",
      }
    : undefined;

  const colDateStyle: React.CSSProperties | undefined = columnWidths.col_date
    ? {
        width: `${columnWidths.col_date}px`,
        flex: "none",
      }
    : undefined;

  const colAttrStyle: React.CSSProperties | undefined = columnWidths.col_attr
    ? {
        width: `${columnWidths.col_attr}px`,
        flex: "none",
      }
    : undefined;

  // ファイルリスト全体のスタイル.
  const fileListStyle: React.CSSProperties = {
    cursor: draggingColumn ? "col-resize" : "auto",
  };

  // ヘッダーの列区切り目を検出します (4px幅).
  const detectColumn = useCallback(
    (x: number): "col_name" | "col_size" | "col_date" | "col_attr" | null => {
      if (!headerRef.current) return null;
      const spans = headerRef.current.querySelectorAll(
        ".col-name, .col-size, .col-date, .col-attr",
      );
      const columns = ["col_name", "col_size", "col_date", "col_attr"];

      for (let i = 0; i < spans.length - 1; i++) {
        const rect = spans[i].getBoundingClientRect();
        const colEnd = rect.right;
        if (Math.abs(x - colEnd) < 4) {
          return columns[i] as
            "col_name" | "col_size" | "col_date" | "col_attr";
        }
      }
      return null;
    },
    [],
  );

  // ドラッグ開始.
  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const col = detectColumn(e.clientX);
      if (col) {
        setDraggingColumn(col);
        setDragStartX(e.clientX);
        e.preventDefault();
      }
    },
    [detectColumn],
  );

  // ドラッグ中.
  useEffect(() => {
    if (!draggingColumn) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartX;
      const newWidths = { ...columnWidths };
      const current = newWidths[draggingColumn] ?? 0;
      newWidths[draggingColumn] = Math.max(30, current + delta);
      onColumnWidthChange?.(newWidths);
      setDragStartX(e.clientX);
    };
    const handleMouseUp = () => {
      setDraggingColumn(null);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingColumn, dragStartX, columnWidths, onColumnWidthChange]);

  // ダブルクリックでauto-fit.
  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const col = detectColumn(e.clientX);
      if (col) {
        const newWidth = getAutoFitWidth(col);
        const newWidths = { ...columnWidths, [col]: newWidth };
        onColumnWidthChange?.(newWidths);
        e.preventDefault();
      }
    },
    [detectColumn, getAutoFitWidth, columnWidths, onColumnWidthChange],
  );

  const rows: ReactElement[] = [];
  for (let row = start; row < end; row++) {
    // 行の高さはどれも同じ想定なので, 描画する範囲の先頭の行だけを測ればよい.
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
          colNameStyle={colNameStyle}
          colSizeStyle={colSizeStyle}
          colDateStyle={colDateStyle}
          colAttrStyle={colAttrStyle}
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
        colNameStyle={colNameStyle}
        colSizeStyle={colSizeStyle}
        colDateStyle={colDateStyle}
        colAttrStyle={colAttrStyle}
      />,
    );
  }

  return (
    <div className="file-list" style={fileListStyle}>
      <div
        className="file-header"
        ref={headerRef}
        onMouseDown={handleHeaderMouseDown}
        onDoubleClick={handleHeaderDoubleClick}
        style={{
          userSelect: draggingColumn ? "none" : "auto",
        }}
      >
        <span className="col-name" style={colNameStyle}>
          ファイル名
        </span>
        {showDetails && (
          <>
            <span className="col-size" style={colSizeStyle}>
              サイズ
            </span>
            <span className="col-date" style={colDateStyle}>
              更新日時
            </span>
            <span className="col-attr" style={colAttrStyle}>
              属性
            </span>
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
