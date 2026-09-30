import { useEffect, type ReactElement } from "react";
import type { TreeRow } from "../types";

/**
 * ツリーペイン コンポーネントのプロパティ.
 */
interface TreePaneProps {
  /** フラット化したツリーの行. */
  rows: TreeRow[];
  /** カーソル位置のパス. */
  cursorPath: string | null;
  /** カーソルを移動する. */
  onMoveCursor: (delta: number) => void;
  /** カーソル位置を展開する (展開済みなら最初の子へ). */
  onExpandOrChild: () => void;
  /** カーソル位置を折り畳む (閉じていれば親へ). */
  onCollapseOrParent: () => void;
  /** ノードを選択する (Enter またはダブルクリック). */
  onSelect: (path: string) => void;
  /** ペインへフォーカスを戻す (Esc / C-g / Tab). */
  onFocusBack: () => void;
  /** true の間だけ, キー操作を受け付ける. */
  focused: boolean;
}

/**
 * ツリー表示ペイン.
 * フォーカス中は window の keydown を購読し, キー操作を受け付けます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ツリーペイン.
 */
export default function TreePane({
  rows,
  cursorPath,
  onMoveCursor,
  onExpandOrChild,
  onCollapseOrParent,
  onSelect,
  onFocusBack,
  focused,
}: TreePaneProps): ReactElement {
  useEffect(() => {
    if (!focused) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        onMoveCursor(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        onMoveCursor(-1);
      } else if (e.key === "ArrowRight" || e.key === "l") {
        e.preventDefault();
        onExpandOrChild();
      } else if (e.key === "ArrowLeft" || e.key === "h") {
        e.preventDefault();
        onCollapseOrParent();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (cursorPath) {
          onSelect(cursorPath);
        }
      } else if (
        e.key === "Escape" ||
        (e.ctrlKey && e.key === "g") ||
        e.key === "Tab"
      ) {
        e.preventDefault();
        onFocusBack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focused,
    cursorPath,
    onMoveCursor,
    onExpandOrChild,
    onCollapseOrParent,
    onSelect,
    onFocusBack,
  ]);

  return (
    <div role="tree" className="tree-pane">
      <div className="tree-header">
        <span className="tree-title">Directory Tree</span>
      </div>
      <ul className="tree-rows">
        {rows.length === 0 && (
          <li className="tree-row">
            <span className="tree-name">Loading...</span>
          </li>
        )}
        {rows.map((row) => (
          <li
            key={row.node.path}
            role="treeitem"
            aria-expanded={row.node.expanded}
            aria-level={row.depth + 1}
            className="tree-row"
            style={{ paddingLeft: `${row.depth * 16}px` }}
            data-cursor={row.node.path === cursorPath ? "active" : "none"}
            onClick={() => {}}
            onDoubleClick={() => onSelect(row.node.path)}
          >
            <span className="tree-icon">
              {row.node.children.length > 0
                ? row.node.expanded
                  ? "▼"
                  : "▶"
                : "•"}
            </span>
            <span className="tree-name">{row.node.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
