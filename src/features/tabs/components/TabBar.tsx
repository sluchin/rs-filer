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
}

/**
 * 画面の上に並べる, タブの一覧.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns タブの React 要素.
 */
export default function TabBar({ tabs, onSelect }: TabBarProps): ReactElement {
  return (
    <div className="tab-bar" role="tablist" aria-label="tabs">
      {tabs.map((tab, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={tab.active}
          tabIndex={-1}
          className="tab"
          onClick={() => onSelect(i)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
