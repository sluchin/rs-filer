import { useEffect, type ReactElement } from "react";
import type { PaneId } from "../../explorer/types";
import { useTree } from "../hooks/useTree";

/**
 * TreePane コンポーネントのプロパティ.
 */
interface TreePaneProps {
  /** このビューが差し替えているペイン. 表示用のラベルにのみ使う. */
  paneId: PaneId;
  /** ツリーの根にするディレクトリ (ペインのカレントディレクトリ). */
  rootPath: string;
  /** 隠しディレクトリを表示するかどうか. */
  showHidden: boolean;
  /** このペインがアクティブかどうか. アクティブな間だけ, キー操作を受け付ける. */
  isActive: boolean;
  /** このペインをアクティブにするハンドラー (クリック時). */
  onActivate: () => void;
  /** ディレクトリを選んだ (`Enter` またはダブルクリック) ときのハンドラー. */
  onSelect: (path: string) => void;
  /** 通常のファイル一覧へ戻る (`t` / `Esc` / `C-g`) ハンドラー. */
  onCancel: () => void;
  /** `Tab` で, もう一方のペインをアクティブにするハンドラー. */
  onSwitchPane: () => void;
}

/**
 * ペインのファイル一覧を, ディレクトリだけのツリー形式の表示に差し替えるビュー.
 *
 * ペインのカレントディレクトリ配下を, ディレクトリの展開・折り畳みができるツリーで表示します.
 * `Enter` またはダブルクリックでそのディレクトリへ移動して, 通常のファイル一覧に戻ります.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ツリー形式のペインのReact要素.
 */
export default function TreePane({
  paneId,
  rootPath,
  showHidden,
  isActive,
  onActivate,
  onSelect,
  onCancel,
  onSwitchPane,
}: TreePaneProps): ReactElement {
  const {
    rows,
    cursorPath,
    setCursorPath,
    moveCursor,
    expandOrChild,
    collapseOrParent,
  } = useTree(rootPath, showHidden);

  useEffect(() => {
    // アクティブでない間は, もう一方のペインの操作を優先し, ツリーのキー操作を受け付けない.
    if (!isActive) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        moveCursor(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        moveCursor(-1);
      } else if (e.key === "ArrowRight" || e.key === "l") {
        e.preventDefault();
        expandOrChild();
      } else if (e.key === "ArrowLeft" || e.key === "h") {
        e.preventDefault();
        collapseOrParent();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (cursorPath) {
          onSelect(cursorPath);
        }
      } else if (
        e.key === "t" ||
        e.key === "Escape" ||
        (e.ctrlKey && e.key === "g")
      ) {
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
  });

  return (
    <div
      role="region"
      aria-label={`${paneId} pane`}
      data-active={isActive}
      className="pane"
      onClick={onActivate}
    >
      <div className="path-bar tree-path" title={rootPath}>
        {rootPath}
      </div>
      <div className="file-list">
        <ul role="tree" className="file-rows">
          {rows.length === 0 && (
            <li className="file-row">
              <span className="col-name">(空)</span>
            </li>
          )}
          {rows.map(({ node, depth }) => (
            <li
              key={node.path}
              role="treeitem"
              aria-expanded={node.expanded}
              aria-level={depth + 1}
              className="file-row"
              data-cursor={
                node.path !== cursorPath
                  ? "none"
                  : isActive
                    ? "active"
                    : "inactive"
              }
              ref={(el) => {
                if (el && node.path === cursorPath) {
                  el.scrollIntoView?.({ block: "nearest" });
                }
              }}
              onClick={() => setCursorPath(node.path)}
              onDoubleClick={() => onSelect(node.path)}
            >
              <span
                className="col-name"
                style={{ paddingLeft: `${depth * 16}px` }}
              >
                <span className="tree-icon">{node.expanded ? "▼" : "▶"}</span>
                {node.name}/
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
