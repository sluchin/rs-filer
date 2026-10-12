import { useEffect, type ReactElement } from "react";
import type { PaneId } from "../../explorer/types";
import { useTree } from "../hooks/useTree";
import FileIcon from "../../explorer/components/FileIcon";
import { useScrollToEnd } from "../../../hooks/useScrollToEnd";
import { getParentPath } from "../../../utils/path";

/**
 * TreePane コンポーネントのプロパティ.
 */
interface TreePaneProps {
  /** このビューが差し替えているペイン. 表示用のラベルにのみ使う. */
  paneId: PaneId;
  /** ツリーの根にするディレクトリ (ペインのカレントディレクトリ). */
  rootPath: string;
  /** 隠しファイル・隠しディレクトリを表示するかどうか. */
  showHidden: boolean;
  /** このペインがアクティブかどうか. アクティブな間だけ, キー操作を受け付ける. */
  isActive: boolean;
  /** このペインをアクティブにするハンドラー (クリック時). */
  onActivate: () => void;
  /** ディレクトリまたはファイルを選んだ (`Enter` またはダブルクリック) ときのハンドラー. ファイルは開く. */
  onSelect: (path: string, isDir: boolean) => void;
  /** 入力中など, ツリーのキー操作を受け付けてはいけないとき (ダイアログを開いている間) は false. */
  keysEnabled: boolean;
  /**
   * 新しいディレクトリを作る (`N` / `+`) ハンドラー. 作成先のディレクトリの絶対パスと, 作成できたときに
   * 呼ぶ関数 (作成したディレクトリの名前を渡す) を受け取る.
   */
  onCreateDirectory: (
    parentPath: string,
    onCreated: (name: string) => void,
  ) => void;
  /**
   * 名前を変える (`r` / `F2`) ハンドラー. 項目の絶対パスと今の名前, 変更できたときに呼ぶ関数 (新しい名前を渡す)
   * を受け取る.
   */
  onRename: (
    path: string,
    name: string,
    onRenamed: (name: string) => void,
  ) => void;
  /**
   * 削除する (`d` / `Delete` はゴミ箱へ, `D` / `Shift+Delete` は完全に削除) ハンドラー. 項目の絶対パスと名前,
   * 完全に削除するか, 削除の処理が終わったときに呼ぶ関数を受け取る.
   */
  onDelete: (
    path: string,
    name: string,
    permanent: boolean,
    onDone: () => void,
  ) => void;
  /** カーソル位置の項目 (ディレクトリも可) を, 外部アプリで開く (`x`) ハンドラー. ツリーは残す. */
  onOpenExternal: (path: string) => void;
  /** 通常のファイル一覧へ戻る (`t` / `Esc` / `C-g`) ハンドラー. */
  onCancel: () => void;
  /** `Tab` で, もう一方のペインをアクティブにするハンドラー. */
  onSwitchPane: () => void;
}

/**
 * ペインのファイル一覧を, ツリー形式の表示に差し替えるビュー.
 *
 * ペインのカレントディレクトリ配下を, ディレクトリの展開・折り畳みができるツリーで表示します.
 * ファイルはディレクトリの後ろに並べます (展開はできません).
 * `Enter` またはダブルクリックで, ディレクトリならそのディレクトリへ移動して, 通常のファイル一覧に戻ります.
 * ファイルなら, ツリーを残したまま, 関連付けられた外部アプリで開きます.
 * 名前には, 長い名前が省略されていても全体を確認できるよう, ツールチップ (`title`) を付けます.
 * `x` でも, カーソル位置の項目 (ディレクトリを含む) を外部アプリで開きます.
 * `N` で, カーソル位置のディレクトリの下に, `+` で, ツリーの根の直下に, 新しいディレクトリを作ります (作ったものが
 * ツリーに加わり, カーソルが合います). `r` / `F2` で名前の変更, `d` / `Delete` でゴミ箱へ, `D` / `Shift+Delete` で
 * 完全に削除します (通常の一覧と同じキーで, ツリーに反映します).
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
  keysEnabled,
  onCreateDirectory,
  onRename,
  onDelete,
  onOpenExternal,
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
    expandDeep,
    collapseDeep,
    refresh,
  } = useTree(rootPath, showHidden);
  const { ref: pathRef } = useScrollToEnd<HTMLDivElement>(rootPath);

  useEffect(() => {
    // アクティブでない間は, もう一方のペインの操作を優先し, ツリーのキー操作を受け付けない.
    // ダイアログ (名前の入力など) を開いている間も, 入力したキーでツリーを動かさない.
    if (!isActive || !keysEnabled) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        moveCursor(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        moveCursor(-1);
      } else if ((e.key === "ArrowRight" || e.key === "l") && !e.shiftKey) {
        e.preventDefault();
        expandOrChild();
      } else if ((e.key === "ArrowRight" || e.key === "L") && e.shiftKey) {
        e.preventDefault();
        expandDeep();
      } else if ((e.key === "ArrowLeft" || e.key === "h") && !e.shiftKey) {
        e.preventDefault();
        collapseOrParent();
      } else if ((e.key === "ArrowLeft" || e.key === "H") && e.shiftKey) {
        e.preventDefault();
        collapseDeep();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = rows.find((r) => r.node.path === cursorPath);
        if (row) {
          onSelect(row.node.path, row.node.isDir);
        }
      } else if (
        (e.key === "N" || e.key === "+") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        // ディレクトリ作成. `N`: カーソル位置のディレクトリの下 (ファイルなら, そのファイルのあるディレクトリ.
        // 何も無ければ, ツリーの根). `+`: 通常の一覧と同じく, いま開いているディレクトリ (ツリーの根) の直下.
        e.preventDefault();
        const row = rows.find((r) => r.node.path === cursorPath);
        const parent =
          e.key === "+" || !row
            ? rootPath
            : row.node.isDir
              ? row.node.path
              : (getParentPath(row.node.path) ?? rootPath);
        onCreateDirectory(parent, (name) => void refresh(parent, name));
      } else if (
        (e.key === "r" || e.key === "F2") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        // 名前の変更. 通常の一覧の `r` / `F2` と同じ.
        e.preventDefault();
        const row = rows.find((r) => r.node.path === cursorPath);
        if (row) {
          const parent = getParentPath(row.node.path) ?? rootPath;
          onRename(
            row.node.path,
            row.node.name,
            (name) => void refresh(parent, name),
          );
        }
      } else if (
        (e.key === "d" || e.key === "D" || e.key === "Delete") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        // 削除. `d` / `Delete`: ゴミ箱へ. `D` / `Shift+Delete`: 完全に削除 (通常の一覧と同じ).
        e.preventDefault();
        const row = rows.find((r) => r.node.path === cursorPath);
        if (row) {
          const parent = getParentPath(row.node.path) ?? rootPath;
          const permanent = e.key === "D" || (e.key === "Delete" && e.shiftKey);
          onDelete(
            row.node.path,
            row.node.name,
            permanent,
            () => void refresh(parent),
          );
        }
      } else if (e.key === "x" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // 通常の一覧の `x` (外部アプリで開く) と同じ. 全体のキー操作は無効なので, ここで代わりに行う.
        e.preventDefault();
        if (cursorPath) {
          onOpenExternal(cursorPath);
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
      <div className="path-bar tree-path" title={rootPath} ref={pathRef}>
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
              aria-expanded={
                node.isDir && !node.empty ? node.expanded : undefined
              }
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
              onDoubleClick={() => onSelect(node.path, node.isDir)}
            >
              <span
                className="col-name"
                style={{ paddingLeft: `${depth * 16}px` }}
                title={node.name}
              >
                {/* 展開の向きは, 同じ ▶ を回転して表す (▼ は別の文字で, 大きさが変わるため). */}
                <span
                  className="tree-icon"
                  data-expanded={node.isDir && !node.empty && node.expanded}
                >
                  {node.isDir && !node.empty ? "▶" : ""}
                </span>
                <FileIcon kind={node.isDir ? "dir" : "file"} />
                {node.isDir ? `${node.name}/` : node.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
