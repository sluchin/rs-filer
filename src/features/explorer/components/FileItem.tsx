import { useEffect, useRef, type ReactElement } from "react";
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
  /** 詳細 (サイズ・更新日時・属性) を表示するかどうか. */
  showDetails: boolean;
  /** クリック時のハンドラー. */
  onClick: () => void;
  /** ダブルクリック時のハンドラー. */
  onDoubleClick: () => void;
}

/**
 * ファイル一覧の 1 行分 (名前・サイズ・更新日時・属性).
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 行のReact要素.
 */
export default function FileItem({
  file,
  cursor,
  marked,
  showDetails,
  onClick,
  onDoubleClick,
}: FileItemProps): ReactElement {
  const ref = useRef<HTMLLIElement>(null);

  // カーソルが見える位置までスクロールする (jsdom には scrollIntoView が無い).
  useEffect(() => {
    if (cursor !== "none") {
      ref.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [cursor]);

  return (
    <li
      ref={ref}
      className="file-row"
      data-cursor={cursor}
      data-marked={marked}
      aria-current={cursor === "active" ? "true" : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <FileIcon kind={file.is_dir ? "dir" : "file"} />
      <span className="col-name file-name">{file.name}</span>
      {showDetails && (
        <>
          <span className="col-size">{formatSize(file)}</span>
          <span className="col-date">{formatDate(file.modified)}</span>
          <span className="col-attr">{formatAttributes(file)}</span>
        </>
      )}
    </li>
  );
}
