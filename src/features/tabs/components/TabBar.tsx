import { useEffect, useRef, useState, type ReactElement } from "react";
import ContextMenu from "../../../components/ContextMenu";
import FileIcon from "../../explorer/components/FileIcon";
import type { TabInfo } from "../hooks/useTabs";

/**
 * TabBar コンポーネントのプロパティ.
 */
interface TabBarProps {
  /** タブの一覧. */
  tabs: TabInfo[];
  /** タブを選んだときのハンドラー (タブの番号を渡す). */
  onSelect: (index: number) => void;
  /** タブの閉じるボタンを押したときのハンドラー (タブの番号を渡す). */
  onClose: (index: number) => void;
  /** 「右のタブを全て閉じる」を選んだときのハンドラー (残すタブの番号を渡す). */
  onCloseRight: (index: number) => void;
  /** 「他のタブを全て閉じる」を選んだときのハンドラー (残すタブの番号を渡す). */
  onCloseOthers: (index: number) => void;
  /** タブをドラッグして動かしたときのハンドラー (動かすタブの番号と, 動かした先の番号を渡す). */
  onReorder: (from: number, to: number) => void;
  /** 追加ボタンを押したときのハンドラー. */
  onNew: () => void;
}

/** ドラッグと見なす, マウスの動き (px). これより小さい動きは, クリックとして扱う. */
const DRAG_THRESHOLD = 5;

/**
 * 画面の上に並べる, タブの一覧. Windows のエクスプローラのように, タブごとに閉じるボタンがあり,
 * 一番右に追加ボタン (+) がある. タブが 1 つだけのときは, 閉じるボタンを出さない.
 * タブはドラッグして, 左右へ動かせる (マウスのイベントで行う. Tauri の既定では, Windows で HTML5 の
 * ドラッグ&ドロップが使えないため).
 *
 * @param props - コンポーネントのプロパティ.
 * @returns タブの React 要素.
 */
export default function TabBar({
  tabs,
  onSelect,
  onClose,
  onCloseRight,
  onCloseOthers,
  onReorder,
  onNew,
}: TabBarProps): ReactElement {
  // 右クリックで開いたメニュー (どのタブのものかと, 位置)
  const [menu, setMenu] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  // ドラッグ中のタブと, 今ポインターがある位置のタブ (番号)
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  /** タブの要素 (ドラッグ先の判定に使う). */
  const items = useRef<(HTMLDivElement | null)[]>([]);
  /** ドラッグを終えた直後の click は, タブを選ぶ操作にしない. */
  const dragged = useRef(false);
  /** 押してからの状態 (押した位置と, 動かすタブ). ドラッグでなければ null. */
  const press = useRef<{ from: number; x: number } | null>(null);
  const dragFrom = drag?.from;

  // ドラッグ中は, ウィンドウ全体でマウスを追う (タブの外へ出ても続ける).
  useEffect(() => {
    if (dragFrom === undefined) {
      return;
    }
    /** ポインターの位置に当たるタブの番号 (左右にはみ出したら, 端のタブ). */
    const overIndex = (x: number): number => {
      const rects = items.current.map((el) =>
        (el as HTMLDivElement).getBoundingClientRect(),
      );
      const hit = rects.findIndex((r) => x >= r.left && x < r.right);
      if (hit >= 0) {
        return hit;
      }
      return x < rects[0].left ? 0 : rects.length - 1;
    };
    const handleMove = (e: MouseEvent): void => {
      setDrag({ from: dragFrom, over: overIndex(e.clientX) });
    };
    const handleUp = (e: MouseEvent): void => {
      dragged.current = true;
      press.current = null;
      setDrag(null);
      onReorder(dragFrom, overIndex(e.clientX));
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragFrom, onReorder]);

  return (
    <div className="tab-bar">
      <div
        className="tab-list"
        role="tablist"
        aria-label="tabs"
        // スクロールバーが無いので, ホイールを横の動きにする.
        onWheel={(e) => {
          e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        {tabs.map((tab, i) => (
          <div
            key={i}
            role="presentation"
            className="tab-item"
            data-dragging={drag?.from === i}
            data-drop={
              drag && drag.over === i && drag.from !== i
                ? drag.over > drag.from
                  ? "after"
                  : "before"
                : undefined
            }
            onMouseDown={(e) => {
              // 左ボタンで, 閉じるボタン以外を押したときだけ, ドラッグの候補にする.
              if (
                e.button !== 0 ||
                (e.target as HTMLElement).closest(".tab-close")
              ) {
                return;
              }
              const from = i;
              press.current = { from, x: e.clientX };
              dragged.current = false;
              const start = (m: MouseEvent): void => {
                if (
                  press.current &&
                  Math.abs(m.clientX - press.current.x) >= DRAG_THRESHOLD
                ) {
                  cleanup();
                  setDrag({ from, over: from });
                }
              };
              const cleanup = (): void => {
                window.removeEventListener("mousemove", start);
                window.removeEventListener("mouseup", cleanup);
              };
              window.addEventListener("mousemove", start);
              window.addEventListener("mouseup", cleanup);
            }}
            onClickCapture={(e) => {
              // ドラッグの終わりに出る click で, タブを選ばない.
              if (dragged.current) {
                dragged.current = false;
                e.stopPropagation();
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ index: i, x: e.clientX, y: e.clientY });
            }}
            data-active={tab.active}
            // 横に動かす幅まで増えても, 今のタブが見えるようにする.
            ref={(el) => {
              items.current[i] = el;
              if (el && tab.active) {
                el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
              }
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab.active}
              tabIndex={-1}
              className="tab"
              title={tab.title}
              onClick={() => onSelect(i)}
            >
              <FileIcon kind="dir" />
              <span className="tab-label">{tab.label}</span>
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                tabIndex={-1}
                className="tab-close"
                aria-label={`タブを閉じる: ${tab.label}`}
                onClick={() => onClose(i)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        tabIndex={-1}
        className="tab-new"
        aria-label="新しいタブ"
        onClick={onNew}
      >
        +
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            { label: "このタブを閉じる", onSelect: () => onClose(menu.index) },
            {
              label: "右のタブを全て閉じる",
              onSelect: () => onCloseRight(menu.index),
            },
            {
              label: "他のタブを全て閉じる",
              onSelect: () => onCloseOthers(menu.index),
            },
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
