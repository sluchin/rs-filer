import type { ReactElement } from "react";
import Modal from "../../../components/Modal";

/**
 * BookmarkMenu コンポーネントのプロパティ.
 */
interface BookmarkMenuProps {
  /** ブックマークしたディレクトリのパス. */
  bookmarks: string[];
  /** アクティブなペインのカレントディレクトリ. */
  currentPath: string;
  /** ブックマークを選んだときのハンドラー. */
  onSelect: (path: string) => void;
  /** カレントディレクトリの登録・解除のハンドラー. */
  onToggleCurrent: () => void;
  /** ブックマークの解除のハンドラー. */
  onRemove: (path: string) => void;
  /** 閉じるハンドラー. */
  onClose: () => void;
}

/**
 * ブックマークの一覧ダイアログ. 選んで移動, 解除, カレントディレクトリの登録ができます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ダイアログのReact要素.
 */
export default function BookmarkMenu({
  bookmarks,
  currentPath,
  onSelect,
  onToggleCurrent,
  onRemove,
  onClose,
}: BookmarkMenuProps): ReactElement {
  return (
    <Modal title="ブックマーク" onClose={onClose}>
      <ul style={{ listStyle: "none", margin: "0 0 0.75rem 0", padding: 0 }}>
        {bookmarks.length === 0 && <li>登録されていません.</li>}
        {bookmarks.map((path, index) => (
          <li key={path} style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              autoFocus={index === 0}
              style={{ flex: 1, textAlign: "left" }}
              onClick={() => onSelect(path)}
            >
              {path}
            </button>
            <button
              type="button"
              aria-label={`${path} を解除`}
              onClick={() => onRemove(path)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        autoFocus={bookmarks.length === 0}
        onClick={onToggleCurrent}
      >
        {bookmarks.includes(currentPath)
          ? "現在のディレクトリを解除"
          : "現在のディレクトリを登録"}
      </button>
    </Modal>
  );
}
