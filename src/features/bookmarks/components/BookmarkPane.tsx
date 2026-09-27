import { useEffect, useState, type ReactElement } from "react";
import type { PaneId } from "../../explorer/types";

/**
 * BookmarkPane コンポーネントのプロパティ.
 */
interface BookmarkPaneProps {
  /** このビューが差し替えているペイン. 表示用のラベルにのみ使う. */
  paneId: PaneId;
  /** このペインがアクティブかどうか. アクティブな間だけ, 一覧のキー操作を受け付ける. */
  isActive: boolean;
  /** このペインをアクティブにするハンドラー (クリック時). */
  onActivate: () => void;
  /** ブックマークしたディレクトリのパス. */
  bookmarks: string[];
  /** 選んだ (`Enter` またはダブルクリック) ときのハンドラー. */
  onSelect: (path: string) => void;
  /** カーソル位置のブックマークを解除するハンドラー. */
  onRemove: (path: string) => void;
  /** 通常のペイン表示へ戻る (`Esc`) ハンドラー. */
  onCancel: () => void;
  /** `Tab` で, もう一方のペインをアクティブにするハンドラー. */
  onSwitchPane: () => void;
}

/**
 * ペインの表示をブックマーク一覧に差し替えるビュー.
 *
 * アクティブな間, ファイル一覧と同様に `j` `k` `↑` `↓` でカーソルを動かし,
 * `Enter` またはダブルクリックでそのディレクトリへ移動して通常のペイン表示に戻ります.
 * `d` / `u` / `Delete` でカーソル位置のブックマークを解除し (一覧にはとどまる),
 * `Esc` で何もせず通常のペイン表示に戻ります. `Tab` では, もう一方のペインへ移り,
 * この一覧は (アクティブでないまま) 表示され続けます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ブックマーク一覧のReact要素.
 */
export default function BookmarkPane({
  paneId,
  isActive,
  onActivate,
  bookmarks,
  onSelect,
  onRemove,
  onCancel,
  onSwitchPane,
}: BookmarkPaneProps): ReactElement {
  const [rawIndex, setIndex] = useState(0);
  // 解除などで件数が減ってカーソルが範囲外に出ても, 描画時にその場でクランプする
  // (件数が変わるたびに setState し直すのではなく, 値そのものを直す).
  const index = Math.min(rawIndex, Math.max(0, bookmarks.length - 1));

  useEffect(() => {
    // アクティブでない間は, もう一方のペインの操作を優先し, 一覧のキー操作を受け付けない.
    if (!isActive) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setIndex(Math.min(bookmarks.length - 1, index + 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setIndex(Math.max(0, index - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (bookmarks[index]) {
          onSelect(bookmarks[index]);
        }
      } else if (e.key === "d" || e.key === "u" || e.key === "Delete") {
        e.preventDefault();
        if (bookmarks[index]) {
          onRemove(bookmarks[index]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Tab") {
        // 全体のキー操作 (ペイン切り替えを含む) は無効になっているので, ここで代わりに行う.
        e.preventDefault();
        onSwitchPane();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, bookmarks, index, onSelect, onRemove, onCancel, onSwitchPane]);

  return (
    <div
      role="region"
      aria-label={`${paneId} pane`}
      data-active={isActive}
      className="pane"
      onClick={onActivate}
    >
      {/* 通常のペインのパス入力欄と高さを揃えるための見出し行. */}
      <div className="path-bar bookmark-title">ブックマーク</div>
      <div className="file-list">
        <ul className="file-rows">
          {bookmarks.length === 0 && (
            <li className="file-row">
              <span className="col-name">登録されていません.</span>
            </li>
          )}
          {bookmarks.map((path, i) => (
            <li
              key={path}
              className="file-row"
              data-cursor={
                i !== index ? "none" : isActive ? "active" : "inactive"
              }
              aria-current={i === index ? "true" : undefined}
              onClick={() => setIndex(i)}
              onDoubleClick={() => onSelect(path)}
            >
              <span className="col-name file-name">{path}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
