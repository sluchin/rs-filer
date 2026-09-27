import { useEffect, useRef, type ReactElement } from "react";
import type { FileEntry } from "../types";
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
  onClick,
  onDoubleClick,
}: {
  cursor: "active" | "inactive" | "none";
  onClick: () => void;
  onDoubleClick: () => void;
}): ReactElement {
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
      <ul className="file-rows">
        {hasParent && (
          <ParentRow
            cursor={
              selectedIndex !== -1 ? "none" : isActive ? "active" : "inactive"
            }
            onClick={onParentClick}
            onDoubleClick={onParent}
          />
        )}
        {files.map((file, idx) => (
          <FileItem
            key={file.path}
            file={file}
            cursor={
              selectedIndex !== idx ? "none" : isActive ? "active" : "inactive"
            }
            marked={marks.includes(file.path)}
            showDetails={showDetails}
            onClick={() => onItemClick(idx, file)}
            onDoubleClick={() => onItemOpen(idx, file)}
          />
        ))}
      </ul>
    </div>
  );
}
