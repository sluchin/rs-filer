import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import PathItem from "../../explorer/components/PathItem";
import { filterPaths, scrollPathList } from "../../explorer/pathList";
import QuickFilterBar from "../../search/components/QuickFilterBar";
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
  /** 押されたキーが, この一覧を開くキー (既定は `b`) かどうか. そのキーで一覧を閉じる (トグル). */
  isToggleKey: (e: KeyboardEvent) => boolean;
  /**
   * 押されたキーが, ほかの一覧を開くキーなら, その一覧へ切り替えて true を返す. 省略した場合は, 切り替えない.
   * 一覧の表示中は全体のキー操作が無効なので, 一覧の側から呼ぶ.
   */
  onOtherListKey?: (e: KeyboardEvent) => boolean;
  /** `o` で, カーソル位置のパスのあるディレクトリを開くハンドラー. 省略した場合は, `o` は何もしない. */
  onReveal?: (path: string) => void;
  /** 行を右クリックしたときのハンドラー (パスと, 画面の座標). 省略した場合は, 何もしない. */
  onContextMenu?: (path: string, x: number, y: number) => void;
  /** 見出し. 省略した場合は「ブックマーク」. */
  title?: string;
  /** 一覧が空のときの表示. 省略した場合は「登録されていません.」. */
  emptyText?: string;
  /** 一覧の項目がファイルか (最近開いたファイルの一覧). 省略した場合は, ディレクトリ. */
  isFiles?: boolean;
}

/**
 * ペインの表示をブックマーク一覧に差し替えるビュー.
 *
 * アクティブな間, ファイル一覧と同様に `j` `k` `↑` `↓` でカーソルを動かし,
 * `Enter` またはダブルクリックでそのディレクトリへ移動して通常のペイン表示に戻ります.
 * パスは省略せずに表示し, ペインに収まらない長いパスは, 一覧を横にスクロール
 * (スクロールバー, または `←` `→`) して見ます.
 * `d` / `u` / `Delete` でカーソル位置のブックマークを解除し (一覧にはとどまる),
 * `Esc` または一覧を開くキー (既定は `b`) で, 何もせず通常のペイン表示に戻ります (トグル). `Tab` では, もう一方のペインへ移り,
 * この一覧は (アクティブでないまま) 表示され続けます.
 * `onReveal` を渡すと, `o` で, カーソル位置のパスのあるディレクトリを開く (最近開いたファイルの一覧用).
 * `onContextMenu` を渡すと, 行を右クリックしたときに, その行にカーソルを移して知らせる.
 * `/` または `Ctrl-S` で, 入力した文字 (空白で区切った語を全て含むもの) に一覧を絞り込みます. `Enter` で入力を終えて
 * 一覧の操作へ戻り (絞り込みは維持), `Esc` で絞り込みを解除します (絞り込んでいないときの `Esc` は, 一覧を閉じます).
 * 見出しと, 空のときの表示を変えれば, 最近開いたファイルなど, パスの一覧にも使えます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ブックマーク一覧のReact要素.
 */
export default function BookmarkPane({
  paneId,
  isActive,
  onActivate,
  bookmarks: allPaths,
  onSelect,
  onRemove,
  onCancel,
  onSwitchPane,
  isToggleKey,
  onOtherListKey,
  onReveal,
  onContextMenu,
  title = "ブックマーク",
  emptyText = "登録されていません.",
  isFiles = false,
}: BookmarkPaneProps): ReactElement {
  const [rawIndex, setIndex] = useState(0);
  /** 絞り込みの文字. 絞り込みの入力欄を出していないときは null. */
  const [filter, setFilter] = useState<string | null>(null);
  const filterInput = useRef<HTMLInputElement | null>(null);
  const rowsRef = useRef<HTMLUListElement>(null);
  const bookmarks = useMemo(
    () => (filter === null ? allPaths : filterPaths(allPaths, filter)),
    [allPaths, filter],
  );
  // 解除などで件数が減ってカーソルが範囲外に出ても, 描画時にその場でクランプする
  // (件数が変わるたびに setState し直すのではなく, 値そのものを直す).
  const index = Math.min(rawIndex, Math.max(0, bookmarks.length - 1));

  useEffect(() => {
    // アクティブでない間は, もう一方のペインの操作を優先し, 一覧のキー操作を受け付けない.
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
      } else if (onOtherListKey?.(e)) {
        // ほかの一覧を開くキーなら, その一覧に替わる
        e.preventDefault();
      } else if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setIndex(Math.min(bookmarks.length - 1, index + 1));
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
        if (bookmarks[index]) {
          onSelect(bookmarks[index]);
        }
      } else if (e.key === "d" || e.key === "u" || e.key === "Delete") {
        e.preventDefault();
        if (bookmarks[index]) {
          onRemove(bookmarks[index]);
        }
      } else if (e.key === "o" && onReveal) {
        e.preventDefault();
        if (bookmarks[index]) {
          onReveal(bookmarks[index]);
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
    bookmarks,
    filter,
    index,
    onSelect,
    onRemove,
    onReveal,
    onCancel,
    onSwitchPane,
    isToggleKey,
    onOtherListKey,
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
      <div className="path-bar bookmark-title">{title}</div>
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
          label={`${paneId} list filter`}
        />
      )}
      <div className="file-list">
        <ul ref={rowsRef} className="file-rows path-rows">
          {bookmarks.length === 0 && (
            <li className="file-row">
              <span className="col-name">
                {allPaths.length === 0
                  ? emptyText
                  : "一致するものがありません."}
              </span>
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
              onContextMenu={(e) => {
                if (onContextMenu) {
                  e.preventDefault();
                  setIndex(i);
                  onContextMenu(path, e.clientX, e.clientY);
                }
              }}
            >
              <PathItem path={path} isDir={!isFiles} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
