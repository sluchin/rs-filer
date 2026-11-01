import type { ReactElement } from "react";
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
  onNew,
}: TabBarProps): ReactElement {
  return (
    <div className="tab-bar" role="tablist" aria-label="tabs">
      {tabs.map((tab, i) => (
        <div
          key={i}
          role="presentation"
          className="tab-item"
          data-active={tab.active}
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
            {tab.label}
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
      <button
        type="button"
        tabIndex={-1}
        className="tab-new"
        aria-label="新しいタブ"
        onClick={onNew}
      >
        +
      </button>
    </div>
  );
}
