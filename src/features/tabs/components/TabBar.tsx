import { useState, type ReactElement } from "react";
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
  /** 追加ボタンを押したときのハンドラー. */
  onNew: () => void;
}

/**
 * 画面の上に並べる, タブの一覧. Windows のエクスプローラのように, タブごとに閉じるボタンがあり,
 * 一番右に追加ボタン (+) がある. タブが 1 つだけのときは, 閉じるボタンを出さない.
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
  onNew,
}: TabBarProps): ReactElement {
  // 右クリックで開いたメニュー (どのタブのものかと, 位置)
  const [menu, setMenu] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
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
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ index: i, x: e.clientX, y: e.clientY });
            }}
            data-active={tab.active}
            // 横に動かす幅まで増えても, 今のタブが見えるようにする.
            ref={(el) => {
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
