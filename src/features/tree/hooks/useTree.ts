import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import log from "loglevel";
import { readDirectory } from "../../../services/tauriApi";
import { getParentPath } from "../../../utils/path";
import type { TreeNode, TreeRow } from "../types";

/**
 * ディレクトリ直下のサブディレクトリをツリーのノードにして読み込みます. 名前順に並べます.
 *
 * @param path - 読み込むディレクトリの絶対パス.
 * @param showHidden - 隠しディレクトリを含めるか.
 * @returns 子ノードの配列. 読み込みに失敗した場合は空.
 */
async function fetchChildren(
  path: string,
  showHidden: boolean,
): Promise<TreeNode[]> {
  try {
    const entries = await readDirectory(path);
    return entries
      .filter((e) => e.is_dir && (showHidden || !e.hidden))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({
        path: e.path,
        name: e.name,
        expanded: false,
        loaded: false,
        children: [],
      }));
  } catch (e) {
    log.error(`[React] ${path} の読み込み失敗:`, e);
    return [];
  }
}

/**
 * 指定したノードを更新した新しいツリーを返します.
 */
function updateNode(
  nodes: TreeNode[],
  path: string,
  update: (node: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map((node) =>
    node.path === path
      ? update(node)
      : { ...node, children: updateNode(node.children, path, update) },
  );
}

/**
 * 展開済みのノードをたどって, 表示順の行にします.
 */
function flatten(nodes: TreeNode[], depth: number): TreeRow[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(node.expanded ? flatten(node.children, depth + 1) : []),
  ]);
}

/**
 * ペインのディレクトリ配下をツリーとして管理するフック.
 *
 * @param rootPath - ツリーの根にするディレクトリ (ペインのカレントディレクトリ).
 * @param showHidden - 隠しディレクトリを表示するか.
 * @returns ツリーの行・カーソル位置と操作関数.
 */
export function useTree(rootPath: string, showHidden: boolean) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [cursorPath, setCursorPath] = useState<string | null>(null);
  const version = useRef(0);

  useEffect(() => {
    version.current += 1;
    const current = version.current;
    fetchChildren(rootPath, showHidden).then((children) => {
      if (current !== version.current) {
        return;
      }
      setRoots(children);
      setCursorPath(children[0]?.path ?? null);
    });
    return () => {
      version.current += 1;
    };
  }, [rootPath, showHidden]);

  const rows = useMemo(() => flatten(roots, 0), [roots]);

  /** ノードを展開・折り畳みする. 未読込のディレクトリを展開するときは子を読み込む. */
  const toggle = useCallback(
    async (node: TreeNode, expand: boolean): Promise<void> => {
      const current = version.current;
      const children =
        expand && !node.loaded
          ? await fetchChildren(node.path, showHidden)
          : node.children;
      if (current !== version.current) {
        return;
      }
      setRoots((prev) =>
        updateNode(prev, node.path, (n) => ({
          ...n,
          children,
          loaded: n.loaded || expand,
          expanded: expand,
        })),
      );
    },
    [showHidden],
  );

  /** カーソルを動かす. 範囲の外には出ない. */
  const moveCursor = useCallback(
    (delta: number): void => {
      const index = rows.findIndex((r) => r.node.path === cursorPath);
      const next = Math.max(0, Math.min(rows.length - 1, index + delta));
      setCursorPath(rows[next]?.node.path ?? null);
    },
    [rows, cursorPath],
  );

  /** カーソル位置のディレクトリを展開する (展開済みなら最初の子へ). */
  const expandOrChild = useCallback((): void => {
    const node = rows.find((r) => r.node.path === cursorPath)?.node;
    if (!node) {
      return;
    }
    if (!node.expanded) {
      void toggle(node, true);
    } else if (node.children.length > 0) {
      setCursorPath(node.children[0].path);
    }
  }, [rows, cursorPath, toggle]);

  /** カーソル位置を折り畳む (閉じていれば親へ. 親がツリーに無ければ何もしない). */
  const collapseOrParent = useCallback((): void => {
    const node = rows.find((r) => r.node.path === cursorPath)?.node;
    if (!node) {
      return;
    }
    if (node.expanded) {
      void toggle(node, false);
      return;
    }
    const parent = getParentPath(node.path);
    if (parent && rows.some((r) => r.node.path === parent)) {
      setCursorPath(parent);
    }
  }, [rows, cursorPath, toggle]);

  return {
    rows,
    cursorPath,
    setCursorPath,
    moveCursor,
    expandOrChild,
    collapseOrParent,
  };
}
