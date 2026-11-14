import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import QuickFilterBar from "../../search/components/QuickFilterBar";
import { filterIndexes, scrollPathList } from "../pathList";
import PathItem from "./PathItem";
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
  /** 履歴の中で現在地に当たる位置. */
  historyIndex: number;
  /** 選んだ (`Enter` またはダブルクリック) ときのハンドラー. 選んだ履歴上の位置も渡す. */
  onSelect: (path: string, index: number) => void;
  /** 通常のペイン表示へ戻る (`Esc`) ハンドラー. */
  onCancel: () => void;
  /** 行を右クリックしたときのハンドラー (パスと, 履歴上の位置と, 画面の座標). 省略した場合は, 何もしない. */
  onContextMenu?: (path: string, index: number, x: number, y: number) => void;
  /** `Tab` で, もう一方のペインをアクティブにするハンドラー. */
  onSwitchPane: () => void;
  /** 押されたキーが, この一覧を開くキー (既定は `M-h`) かどうか. そのキーで一覧を閉じる (トグル). */
  isToggleKey: (e: KeyboardEvent) => boolean;
}

/**
 * ペインの表示を, そのペインのディレクトリ移動履歴の一覧に差し替えるビュー.
 *
 * アクティブな間, ファイル一覧と同様に `j` `k` `↑` `↓` でカーソルを動かし,
 * `Enter` またはダブルクリックで, 隣り合う位置に限らずどこへでも直接移動して
 * 通常のペイン表示に戻ります. `Esc` または一覧を開くキー (既定は `M-h`) で, 何もせず
 * 通常のペイン表示に戻ります (トグル). パスは省略せずに表示し, ペインに収まらない長いパスは,
 * 一覧を横にスクロール (スクロールバー, または `←` `→`) して見ます.
 * `/` または `Ctrl-S` で, 入力した文字 (空白で区切った語を全て含むもの) に一覧を絞り込みます. `Enter` で入力を終えて一覧の操作へ
 * 戻り (絞り込みは維持), `Esc` で絞り込みを解除します (絞り込んでいないときの `Esc` は, 一覧を閉じます).
 * `onContextMenu` を渡すと, 行を右クリックしたときに, その行にカーソルを移して知らせる.
 * 絞り込んでも, 選んだときに渡す履歴上の位置は, 絞り込む前の位置です.
 * `Tab` では, もう一方のペインへ移り, この一覧は (アクティブでないまま) 表示され続けます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 移動履歴の一覧のReact要素.
 */
export default function HistoryPane({
  paneId,
  isActive,
  onActivate,
  history,
  historyIndex,
  onSelect,
  onCancel,
  onContextMenu,
  onSwitchPane,
  isToggleKey,
}: HistoryPaneProps): ReactElement {
  const [rawIndex, setIndex] = useState(historyIndex);
  /** 絞り込みの文字. 絞り込みの入力欄を出していないときは null. */
  const [filter, setFilter] = useState<string | null>(null);
  const filterInput = useRef<HTMLInputElement | null>(null);
  const rowsRef = useRef<HTMLUListElement>(null);
  /** 表示する行の, 履歴上の位置 (絞り込んでいなければ, 全て). */
  const rows = useMemo(
    () =>
      filter === null
        ? history.map((_, i) => i)
        : filterIndexes(history, filter),
    [history, filter],
  );
  // 履歴が変わってカーソルが範囲外に出ても, 描画時にその場でクランプする.
  // index は, 表示している行の中の位置 (履歴上の位置は rows[index]).
  const index = Math.min(Math.max(rawIndex, 0), Math.max(0, rows.length - 1));

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      // 絞り込みの入力欄での入力は, 入力欄が受け取る (一覧の操作にしない).
      if (e.target instanceof HTMLInputElement) {
        return;
      }
      if (isToggleKey(e)) {
        // 一覧を開くキーをもう一度押したら, 閉じる (トグル)
        e.preventDefault();
        onCancel();
      } else if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setIndex(Math.min(rows.length - 1, index + 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setIndex(Math.max(0, index - 1));
      } else if (
        // 長いパスを見るため, 一覧を横にスクロールする.
        // キー操作を受け付けるのはマウントしている間だけなので, 一覧の要素は必ずある
        scrollPathList(rowsRef.current as HTMLUListElement, e.key)
      ) {
        e.preventDefault();
      } else if (e.key === "Enter") {
        e.preventDefault();
        // 絞り込みで 1 件も残っていなければ, 選ぶものがない.
        const at = rows[index];
        if (at !== undefined) {
          onSelect(history[at], at);
        }
      } else if (e.key === "/" || (e.ctrlKey && e.key === "s")) {
        // 入力欄が出ていれば (Enter で抜けたあと) そこへ戻り, 出ていなければ出す.
        e.preventDefault();
        if (filterInput.current) {
          filterInput.current.focus();
        } else {
          setFilter("");
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (filter === null) {
          onCancel();
        } else {
          setFilter(null);
        }
      } else if (e.key === "Tab") {
        // 全体のキー操作 (ペイン切り替えを含む) は無効になっているので, ここで代わりに行う.
        e.preventDefault();
        onSwitchPane();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isActive,
    history,
    rows,
    filter,
    index,
    onSelect,
    onCancel,
    onSwitchPane,
    isToggleKey,
  ]);

  return (
    <div
      role="region"
      aria-label={`${paneId} pane`}
      data-active={isActive}
      className="pane"
      onClick={onActivate}
    >
      {/* 通常のペインのパス入力欄と高さを揃えるための見出し行. */}
      <div className="path-bar bookmark-title">移動履歴</div>
      {filter !== null && (
        <QuickFilterBar
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setIndex(0);
          }}
          onCancel={() => setFilter(null)}
          inputRef={(element) => {
            filterInput.current = element;
          }}
          label={`${paneId} history filter`}
        />
      )}
      <div className="file-list">
        <ul ref={rowsRef} className="file-rows path-rows">
          {rows.length === 0 && (
            <li className="file-row">
              <span className="col-name">一致するものがありません.</span>
            </li>
          )}
          {rows.map((i, position) => (
            <li
              key={`${i}-${history[i]}`}
              className="file-row"
              data-cursor={
                position !== index ? "none" : isActive ? "active" : "inactive"
              }
              aria-current={position === index ? "true" : undefined}
              onClick={() => setIndex(position)}
              onDoubleClick={() => onSelect(history[i], i)}
              onContextMenu={(e) => {
                if (onContextMenu) {
                  e.preventDefault();
                  setIndex(position);
                  onContextMenu(history[i], i, e.clientX, e.clientY);
                }
              }}
            >
              <PathItem path={history[i]} isDir />
              {i === historyIndex && <span className="col-attr">現在地</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
