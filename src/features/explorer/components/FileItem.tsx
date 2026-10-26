import type { CSSProperties, ReactElement } from "react";
import {
  formatAttributes,
  formatDate,
  formatSize,
} from "../../../utils/formatters";
import type { FileEntry } from "../types";
import FileIcon from "./FileIcon";

/**
 * FileItem コンポーネントのプロパティ.
 */
interface FileItemProps {
  /** 表示するエントリ. */
  file: FileEntry;
  /** カーソルの状態. アクティブなペインでは濃く, 非アクティブなペインでは薄く示す. */
  cursor: "active" | "inactive" | "none";
  /** マークされているかどうか. */
  marked: boolean;
  /** 削除の印 (Dired の `D`) が付いているかどうか. */
  flagged?: boolean;
  /** 詳細 (サイズ・更新日時・属性) を表示するかどうか. */
  showDetails: boolean;
  /** 行の高さを測るための ref コールバック (仮想スクロール用). */
  measureRef: (element: HTMLElement | null) => void;
  /** クリック時のハンドラー. */
  onClick: () => void;
  /** ダブルクリック時のハンドラー. */
  onDoubleClick: () => void;
  /** 右クリック時のハンドラー (右クリックした位置を渡す). */
  onContextMenu: (x: number, y: number) => void;
  /** ファイル名列のスタイル. */
  colNameStyle?: CSSProperties;
  /** サイズ列のスタイル. */
  colSizeStyle?: CSSProperties;
  /** 日付列のスタイル. */
  colDateStyle?: CSSProperties;
  /** 属性列のスタイル. */
  colAttrStyle?: CSSProperties;
  /** 行全体のスタイル (横にスクロールするときの最小の幅). */
  rowStyle?: CSSProperties;
}

/**
 * ファイル一覧の 1 行分 (名前・サイズ・更新日時・属性).
 *
 * 名前の列には, 長い名前が「…」で省略されていても全体を確認できるよう, 名前をツールチップ (`title`) で付けます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 行のReact要素.
 */
export default function FileItem({
  file,
  cursor,
  marked,
  flagged = false,
  showDetails,
  measureRef,
  onClick,
  onDoubleClick,
  onContextMenu,
  colNameStyle,
  colSizeStyle,
  colDateStyle,
  colAttrStyle,
  rowStyle,
}: FileItemProps): ReactElement {
  return (
    <li
      ref={measureRef}
      className="file-row"
      style={rowStyle}
      data-cursor={cursor}
      data-marked={marked}
      data-flagged={flagged}
      aria-current={cursor === "active" ? "true" : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
    >
      <FileIcon kind={file.is_dir ? "dir" : "file"} />
      <span
        className="col-name file-name"
        style={colNameStyle}
        title={file.name}
      >
        {file.name}
      </span>
      {showDetails && (
        <>
          <span className="col-size" style={colSizeStyle}>
            {formatSize(file)}
          </span>
          <span className="col-date" style={colDateStyle}>
            {formatDate(file.modified)}
          </span>
          <span className="col-attr" style={colAttrStyle}>
            {formatAttributes(file)}
          </span>
        </>
      )}
    </li>
  );
}
