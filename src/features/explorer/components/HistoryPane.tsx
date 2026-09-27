import { useEffect, useState, type ReactElement } from "react";
import type { PaneId } from "../types";

/**
 * HistoryPane コンポーネントのプロパティ.
 */
interface HistoryPaneProps {
  /** このビューが差し替えているペイン. 表示用のラベルにのみ使う. */
  paneId: PaneId;
  /** このペインがアクティブかどうか. アクティブな間だけ, 一覧のキー操作を受け付ける. */
  isActive: boolean;
  /** このペインをアクティブにするハンドラー (クリック時). */
  onActivate: () => void;
  /** このペインが移動してきたディレクトリの履歴 (古い順). */
  history: string[];
  /** 履歴の中で, 現在地に当たる位置. */
  historyIndex: number;
  /** 選んだ (`Enter` またはダブルクリック) ときのハンドラー. 選んだ履歴上の位置も渡す. */
  onSelect: (path: string, index: number) => void;
  /** 通常のペイン表示へ戻る (`Esc`) ハンドラー. */
  onCancel: () => void;
  /** `Tab` で, もう一方のペインをアクティブにするハンドラー. */
  onSwitchPane: () => void;
}

/**
 * ペインの表示を, そのペインのディレクトリ移動履歴の一覧に差し替えるビュー.
 *
 * アクティブな間, ファイル一覧と同様に `j` `k` `↑` `↓` でカーソルを動かし,
 * `Enter` またはダブルクリックで, 隣り合う位置に限らずどこへでも直接移動して
 * 通常のペイン表示に戻ります. `Esc` で何もせず通常のペイン表示に戻ります.
 * `Tab` では, もう一方のペインへ移り, この一覧は (アクティブでないまま) 表示され続けます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 履歴一覧のReact要素.
 */
export default function HistoryPane({
  paneId,
  isActive,
  onActivate,
  history,
  historyIndex,
  onSelect,
  onCancel,
  onSwitchPane,
}: HistoryPaneProps): ReactElement {
  const [rawIndex, setIndex] = useState(historyIndex);
  // 履歴が変わってカーソルが範囲外に出ても, 描画時にその場でクランプする.
  const index = Math.min(
    Math.max(rawIndex, 0),
    Math.max(0, history.length - 1),
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setIndex(Math.min(history.length - 1, index + 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setIndex(Math.max(0, index - 1));
      } else if (e.key === "Enter") {
        // 少なくとも現在地の 1 件は必ずあるので, history[index] は常に存在する.
        e.preventDefault();
        onSelect(history[index], index);
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
  }, [isActive, history, index, onSelect, onCancel, onSwitchPane]);

  return (
    <div
      role="region"
      aria-label={`${paneId} pane`}
      data-active={isActive}
      className="pane"
      onClick={onActivate}
    >
      {/* 通常のペインのパス入力欄と高さを揃えるための見出し行. */}
      <div className="path-bar bookmark-title">履歴</div>
      <div className="file-list">
        {/* このビューを表示できる時点で, 少なくとも現在地の 1 件は必ず history にある. */}
        <ul className="file-rows">
          {history.map((path, i) => (
            <li
              key={`${i}-${path}`}
              className="file-row"
              data-cursor={
                i !== index ? "none" : isActive ? "active" : "inactive"
              }
              aria-current={i === index ? "true" : undefined}
              onClick={() => setIndex(i)}
              onDoubleClick={() => onSelect(path, i)}
            >
              <span className="col-name file-name">{path}</span>
              {i === historyIndex && <span className="col-attr">現在地</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
