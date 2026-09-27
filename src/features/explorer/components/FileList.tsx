import type { ReactElement } from "react";
import type { FileEntry } from "../types";
import FileIcon from "./FileIcon";
import FileItem from "./FileItem";

/**
 * FileList コンポーネントのプロパティ.
 */
interface FileListProps {
  /** 表示するエントリ一覧. */
  files: FileEntry[];
  /** カーソル位置のインデックス. */
  selectedIndex: number;
  /** このペインがアクティブかどうか. */
  isActive: boolean;
  /** 親ディレクトリへ移動できるかどうか. true の場合は先頭に `..` の行を表示する. */
  hasParent: boolean;
  /** `..` の行をダブルクリックしたときのハンドラー. */
  onParent: () => void;
  /** 項目クリック時のハンドラー. */
  onItemClick: (index: number, file: FileEntry) => void;
  /** 項目ダブルクリック時のハンドラー. */
  onItemOpen: (index: number, file: FileEntry) => void;
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
  hasParent,
  onParent,
  onItemClick,
  onItemOpen,
}: FileListProps): ReactElement {
  return (
    <div className="file-list">
      <div className="file-header">
        <span className="col-name">ファイル名</span>
        <span className="col-size">サイズ</span>
        <span className="col-date">更新日時</span>
        <span className="col-attr">属性</span>
      </div>
      <ul className="file-rows">
        {hasParent && (
          <li className="file-row" onDoubleClick={onParent}>
            <FileIcon kind="parent" />
            <span className="col-name">..</span>
          </li>
        )}
        {files.map((file, idx) => (
          <FileItem
            key={file.path}
            file={file}
            cursor={
              selectedIndex !== idx ? "none" : isActive ? "active" : "inactive"
            }
            onClick={() => onItemClick(idx, file)}
            onDoubleClick={() => onItemOpen(idx, file)}
          />
        ))}
      </ul>
    </div>
  );
}
