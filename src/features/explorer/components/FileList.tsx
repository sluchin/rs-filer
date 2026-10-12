import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { FileEntry } from "../types";
import type { ColumnWidths } from "../../../features/settings/types";
import {
  formatAttributes,
  formatDate,
  formatSize,
} from "../../../utils/formatters";
import { useVirtualRows } from "../hooks/useVirtualRows";
import FileIcon from "./FileIcon";
import FileItem from "./FileItem";

/**
 * 行の名前の列の前にある, アイコンの幅 (px). CSS の `.file-icon` (幅 16 + 左の余白 3 + 右の余白 2) と同じ.
 * ヘッダーの名前の列は, このアイコンの分も含む. 名前の列の幅を内容に合わせるとき, この分を足す.
 */
const ICON_COLUMN_WIDTH = 21;

/** 列の幅の最小値 (px). */
const MIN_COLUMN_WIDTH = 30;

/** 文字の左右の余白 (4 + 4) と, ヘッダーの右の区切り線 (1) の幅 (px). 内容に合わせた幅に足す. */
const CELL_PADDING = 9;

/** 一覧の列の名前. 左から, 名前・サイズ・更新日時・属性. */
type ColumnName = "col_name" | "col_size" | "col_date" | "col_attr";

/** 列を, 左から並べた順序. */
const COLUMN_ORDER: ColumnName[] = [
  "col_name",
  "col_size",
  "col_date",
  "col_attr",
];

/**
 * 列ごとの, 内容に合わせた幅を求めるための文字列. 画面に表示するものと同じ文字列にする (そうしないと,
 * 幅が足りずに, 文字が切れる).
 */
const COLUMN_TEXT: Record<
  ColumnName,
  {
    /** ヘッダーの見出し. */
    title: string;
    /** 行に表示する文字列. */
    cell: (file: FileEntry) => string;
    /** 文字の前にあるもの (名前の前のアイコン) の幅 (px). */
    extra: number;
  }
> = {
  col_name: {
    title: "ファイル名",
    cell: (f) => f.name,
    extra: ICON_COLUMN_WIDTH,
  },
  col_size: { title: "サイズ", cell: (f) => formatSize(f), extra: 0 },
  col_date: {
    title: "更新日時",
    cell: (f) => formatDate(f.modified),
    extra: 0,
  },
  col_attr: { title: "属性", cell: (f) => formatAttributes(f), extra: 0 },
};

/**
 * 境界線の「右側」の列を返します. 名前の列は残りの幅 (右端が固定されたサイズ・更新日時・属性が
 * 右にそろう) ので, 境界線の操作 (ドラッグ・ダブルクリック) は, 境界の右側の列に対して行います.
 *
 * @param left - 境界線の左側の列 (境界線の位置にある, 列の右端を持つ列).
 * @returns 境界線の右側の列. 一番右の列の場合は, その列自身.
 */
function columnRightOf(left: ColumnName): ColumnName {
  const index = COLUMN_ORDER.indexOf(left);
  return COLUMN_ORDER[Math.min(index + 1, COLUMN_ORDER.length - 1)];
}

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
  const [draggingColumn, setDraggingColumn] = useState<ColumnName | null>(null);
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
  // 行の一覧のスクロールバーの幅. ヘッダーにも同じ幅の余白を足して, 列の位置をそろえる.
  const rowsRef = useRef<HTMLElement | null>(null);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const setRowsElement = useCallback(
    (element: HTMLElement | null): void => {
      rowsRef.current = element;
      containerRef(element);
    },
    [containerRef],
  );
  useLayoutEffect(() => {
    const element = rowsRef.current;
    if (!element) {
      return;
    }
    const measure = (): void =>
      setScrollbarWidth(element.offsetWidth - element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // カーソルの, 「..」を含めた行番号 (仮想スクロールの座標系).
  const cursorRow = hasParent ? selectedIndex + 1 : selectedIndex;

  useEffect(() => {
    scrollToIndex(cursorRow);
  }, [cursorRow, scrollToIndex]);

  // テキスト幅を測定します. 文字の大きさと書体は, 一覧の行と同じもの (`body` ではなく, 一覧の要素) で測る.
  const measureTextWidth = useCallback((text: string): number => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return 0;
    const style = window.getComputedStyle(
      rowsRef.current ?? headerRef.current ?? document.body,
    );
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return context.measureText(text).width;
  }, []);

  // 列の幅を, 内容に合わせた幅にします. 測るのは, 画面に表示する文字列 (整形したもの) です.
  const getAutoFitWidth = useCallback(
    (column: ColumnName): number => {
      const { title, cell, extra } = COLUMN_TEXT[column];
      const widest = Math.max(
        measureTextWidth(title),
        ...files.map((f) => measureTextWidth(cell(f)) + extra),
      );
      return Math.max(Math.ceil(widest) + CELL_PADDING, MIN_COLUMN_WIDTH);
    },
    [files, measureTextWidth],
  );

  // 各列のスタイル. 名前の列は, 常に残りの幅を使う (保存した幅は使わない). サイズ・更新日時・属性の列は
  // 固定の幅で右にそろい, 属性の列は, 起動したときから, ペインの右はじに合う.
  const colNameStyle: React.CSSProperties = { flex: 1 };

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
  const detectColumn = useCallback((x: number): ColumnName | null => {
    if (!headerRef.current) return null;
    const spans = headerRef.current.querySelectorAll(
      ".col-name, .col-size, .col-date, .col-attr",
    );

    for (let i = 0; i < spans.length - 1; i++) {
      const rect = spans[i].getBoundingClientRect();
      const colEnd = rect.right;
      if (Math.abs(x - colEnd) < 4) {
        return COLUMN_ORDER[i];
      }
    }
    return null;
  }, []);

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

  // ヘッダーの列 (`.col-size` など) の, 今の幅を測ります. 見つからなければ 0.
  const measureColumn = useCallback((column: ColumnName): number => {
    const element = headerRef.current?.querySelector(
      `.${column.replace("_", "-")}`,
    );
    return element ? element.getBoundingClientRect().width : 0;
  }, []);

  // ドラッグ中. 名前の列は残りの幅で, サイズ・更新日時・属性は右にそろっているので, 境界線をつかんで動かすと,
  // 境界の「右側」の列が (右端を固定したまま) 逆向きに変わる. 右へ動かすと狭く, 左へ動かすと広くなる.
  // 保存していない列は, 今の見た目の幅から変える.
  useEffect(() => {
    if (!draggingColumn) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartX;
      const target = columnRightOf(draggingColumn);
      const newWidths = { ...columnWidths };
      const current = newWidths[target] ?? measureColumn(target);
      newWidths[target] = Math.max(MIN_COLUMN_WIDTH, current - delta);
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
  }, [
    draggingColumn,
    dragStartX,
    columnWidths,
    onColumnWidthChange,
    measureColumn,
  ]);

  // ダブルクリックでauto-fit. 境界の「右側」の列を, 内容に合う幅にする (ドラッグと同じ列).
  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const col = detectColumn(e.clientX);
      if (!col) {
        return;
      }
      const target = columnRightOf(col);
      onColumnWidthChange?.({
        ...columnWidths,
        [target]: getAutoFitWidth(target),
      });
      e.preventDefault();
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
          paddingRight: scrollbarWidth,
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
      <ul className="file-rows" ref={setRowsElement}>
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
