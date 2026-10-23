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

/** サイズ・更新日時・属性の列の, 幅を保存していないときの幅 (px). CSS の `.col-size` などと同じ. */
const DEFAULT_COLUMN_WIDTH = { col_size: 72, col_date: 136, col_attr: 52 };

/** ヘッダーの境界線をつかめる範囲 (境界線から左右にこの px 未満). */
const BORDER_GRAB_RANGE = 6;

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
 * 列の幅の最小値 (px) を返します. 名前の列は, アイコンの分も含みます.
 *
 * @param column - 列.
 * @returns 最小の幅.
 */
function minWidthOf(column: ColumnName): number {
  return column === "col_name"
    ? MIN_COLUMN_WIDTH + ICON_COLUMN_WIDTH
    : MIN_COLUMN_WIDTH;
}

/** 列の境界線をドラッグしている間の状態. */
interface ColumnDrag {
  /** ドラッグしている境界線の左側の列 (幅が変わる列). */
  column: ColumnName;
  /** ドラッグを始めたときのマウスの x 座標. */
  startX: number;
  /** ドラッグを始めたときの, すべての列の幅 (px). */
  widths: Required<ColumnWidths>;
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
  /** 項目の右クリック時のハンドラー (右クリックした位置を渡す). */
  onItemContextMenu: (
    index: number,
    file: FileEntry,
    x: number,
    y: number,
  ) => void;
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
  rowStyle,
}: {
  cursor: "active" | "inactive" | "none";
  measureRef: (element: HTMLElement | null) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  colNameStyle?: React.CSSProperties;
  colSizeStyle?: React.CSSProperties;
  colDateStyle?: React.CSSProperties;
  colAttrStyle?: React.CSSProperties;
  rowStyle?: React.CSSProperties;
}): ReactElement {
  return (
    <li
      ref={measureRef}
      className="file-row"
      style={rowStyle}
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
  onItemContextMenu,
  columnWidths = {},
  onColumnWidthChange,
}: FileListProps): ReactElement {
  const [drag, setDrag] = useState<ColumnDrag | null>(null);
  // 行の一覧の横スクロールの位置. ヘッダーも同じだけ動かして, 列の位置をそろえる.
  const [scrollLeft, setScrollLeft] = useState(0);
  // マウスが, ヘッダーの境界線の上にあるか. あるときは, つかめることを示すカーソルにする.
  const [overBorder, setOverBorder] = useState(false);
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
    // 行の一覧 (ul) は常に描くので, マウントした後は必ずある
    const element = rowsRef.current as HTMLElement;
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
    // 測るのは, マウントした後の操作 (ヘッダーのダブルクリックなど) のときだけなので, 行の一覧は必ずある
    const style = window.getComputedStyle(rowsRef.current as HTMLElement);
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
      return Math.max(Math.ceil(widest) + CELL_PADDING, minWidthOf(column));
    },
    [files, measureTextWidth],
  );

  // 各列のスタイル. 名前の列は, 幅を保存していなければ残りの幅を使い (属性の列が, ペインの右はじに合う),
  // 保存していれば固定の幅になる. 幅を保存した名前の列は, 行ではアイコンの分だけ狭くする.
  // 固定の幅の合計がペインより広いときは, 行の一覧が横にスクロールする.
  const nameWidth = showDetails ? columnWidths.col_name : undefined;
  const headerNameStyle: React.CSSProperties =
    nameWidth === undefined
      ? { flex: 1 }
      : { width: `${nameWidth}px`, flex: "none" };
  const colNameStyle: React.CSSProperties =
    nameWidth === undefined
      ? { flex: 1 }
      : {
          width: `${Math.max(nameWidth - ICON_COLUMN_WIDTH, 0)}px`,
          flex: "none",
        };

  const fixedStyle = (width: number | undefined) =>
    width === undefined ? undefined : { width: `${width}px`, flex: "none" };
  const colSizeStyle = fixedStyle(columnWidths.col_size);
  const colDateStyle = fixedStyle(columnWidths.col_date);
  const colAttrStyle = fixedStyle(columnWidths.col_attr);

  // 行とヘッダーの最小の幅 (すべての列が収まる幅). これより狭いペインでは, 横にスクロールする.
  const totalWidth =
    (nameWidth ?? minWidthOf("col_name")) +
    (columnWidths.col_size ?? DEFAULT_COLUMN_WIDTH.col_size) +
    (columnWidths.col_date ?? DEFAULT_COLUMN_WIDTH.col_date) +
    (columnWidths.col_attr ?? DEFAULT_COLUMN_WIDTH.col_attr);
  const rowStyle: React.CSSProperties | undefined = showDetails
    ? { minWidth: `${totalWidth}px` }
    : undefined;

  // ファイルリスト全体のスタイル.
  const fileListStyle: React.CSSProperties = {
    cursor: drag ? "col-resize" : "auto",
  };

  // ヘッダーの列の右の境界線を検出します (左右に 6 px ずつ). 境界線の左にある列を返します. 詳細を表示していない
  // (名前の列だけの) ときは, 幅を変えられない.
  const detectColumn = useCallback((x: number): ColumnName | null => {
    // マウスの操作のときだけ呼ぶので, ヘッダーは必ずある
    const header = headerRef.current as HTMLDivElement;
    const spans = header.querySelectorAll(
      ".col-name, .col-size, .col-date, .col-attr",
    );
    if (spans.length < 2) return null;

    for (let i = 0; i < spans.length; i++) {
      const colEnd = spans[i].getBoundingClientRect().right;
      if (Math.abs(x - colEnd) < BORDER_GRAB_RANGE) {
        return COLUMN_ORDER[i];
      }
    }
    return null;
  }, []);

  // ヘッダーの列 (`.col-size` など) の, 今の幅を測ります..
  const measureColumn = useCallback((column: ColumnName): number => {
    // ドラッグを始められるのは, 詳細を表示して全ての列がヘッダーにあるときだけなので, 列は必ずある
    const element = (headerRef.current as HTMLDivElement).querySelector(
      `.${column.replace("_", "-")}`,
    ) as Element;
    return element.getBoundingClientRect().width;
  }, []);

  // ドラッグ開始. このとき, 幅を保存していない列は, 今の見た目の幅で固定する (動かした列より右の列の位置が、
  // 動かさないうちに変わらないように).
  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const column = detectColumn(e.clientX);
      if (!column) {
        return;
      }
      const widths: Required<ColumnWidths> = {
        col_name: columnWidths.col_name ?? measureColumn("col_name"),
        col_size: columnWidths.col_size ?? measureColumn("col_size"),
        col_date: columnWidths.col_date ?? measureColumn("col_date"),
        col_attr: columnWidths.col_attr ?? measureColumn("col_attr"),
      };
      setDrag({ column, startX: e.clientX, widths });
      e.preventDefault();
    },
    [detectColumn, measureColumn, columnWidths],
  );

  // ドラッグ中. 境界線の「左側」の列の幅を、境界線がカーソルについて動くように変える. 右の列は、その分
  // 右へずれる. ペインより広くなったら、行の一覧に横のスクロールバーが出る.
  useEffect(() => {
    if (!drag) return;
    const handleMouseMove = (e: MouseEvent) => {
      const width = Math.max(
        minWidthOf(drag.column),
        drag.widths[drag.column] + e.clientX - drag.startX,
      );
      onColumnWidthChange?.({ ...drag.widths, [drag.column]: width });
    };
    const handleMouseUp = () => {
      setDrag(null);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [drag, onColumnWidthChange]);

  // ダブルクリックで列幅を内容に合わせる. 境界線の「左側」の列を、内容に合う幅にする (ドラッグと同じ列).
  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const column = detectColumn(e.clientX);
      if (!column) {
        return;
      }
      onColumnWidthChange?.({
        ...columnWidths,
        [column]: getAutoFitWidth(column),
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
          rowStyle={rowStyle}
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
        onContextMenu={(x, y) => onItemContextMenu(idx, file, x, y)}
        colNameStyle={colNameStyle}
        colSizeStyle={colSizeStyle}
        colDateStyle={colDateStyle}
        colAttrStyle={colAttrStyle}
        rowStyle={rowStyle}
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
        onMouseMove={(e) => setOverBorder(detectColumn(e.clientX) !== null)}
        onMouseLeave={() => setOverBorder(false)}
        style={{
          userSelect: drag ? "none" : "auto",
          cursor: drag || overBorder ? "col-resize" : "auto",
          paddingRight: scrollbarWidth,
        }}
      >
        <div
          className="file-header-row"
          style={{
            ...rowStyle,
            transform: scrollLeft ? `translateX(${-scrollLeft}px)` : undefined,
          }}
        >
          <span className="col-name" style={headerNameStyle}>
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
      </div>
      <ul
        className="file-rows"
        ref={setRowsElement}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      >
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
