import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import log from "loglevel";
import { dirsHaveEntries, readDirectory } from "../../../services/tauriApi";
import { getParentPath } from "../../../utils/path";
import type { TreeNode, TreeRow } from "../types";

/**
 * 配下にディレクトリもファイルも無いディレクトリを調べます.
 *
 * @param paths - 調べるディレクトリの絶対パスの配列.
 * @param showHidden - 隠しファイルも数えるか.
 * @returns 配下に何も無いと分かったディレクトリのパスの集合. 調べられなかった場合は空 (マークを残す).
 */
async function findEmptyDirs(
  paths: string[],
  showHidden: boolean,
): Promise<Set<string>> {
  if (paths.length === 0) {
    return new Set();
  }
  try {
    const flags = await dirsHaveEntries(paths, showHidden);
    return new Set(paths.filter((_, i) => flags[i] === false));
  } catch (e) {
    log.warn("[React] 配下の有無の確認失敗:", e);
    return new Set();
  }
}

/**
 * ディレクトリ直下のサブディレクトリとファイルをツリーのノードにして読み込みます.
 * ディレクトリを先に, ファイルを後に, それぞれ名前順に並べます.
 *
 * @param path - 読み込むディレクトリの絶対パス.
 * @param showHidden - 隠しファイル・隠しディレクトリを含めるか.
 * @returns 子ノードの配列. 読み込みに失敗した場合は空.
 */
async function fetchChildren(
  path: string,
  showHidden: boolean,
): Promise<TreeNode[]> {
  try {
    const entries = await readDirectory(path);
    const sorted = entries
      .filter((e) => showHidden || !e.hidden)
      .sort(
        (a, b) =>
          Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name),
      );
    const dirs = sorted.filter((e) => e.is_dir);
    const emptyDirs = await findEmptyDirs(
      dirs.map((e) => e.path),
      showHidden,
    );
    return sorted.map((e) => ({
      path: e.path,
      name: e.name,
      isDir: e.is_dir,
      empty: emptyDirs.has(e.path),
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
 * @param showHidden - 隠しファイル・隠しディレクトリを表示するか.
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

  /** ノードを展開・折り畳みする. 未読込のディレクトリを展開するときは子を読み込む. ファイルは何もしない. */
  const toggle = useCallback(
    async (node: TreeNode, expand: boolean): Promise<void> => {
      if (!node.isDir) {
        return;
      }
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
          empty: n.empty || (expand && children.length === 0),
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

  /** カーソル位置のディレクトリを展開する (展開済みなら最初の子へ. ファイルなら何もしない). */
  const expandOrChild = useCallback((): void => {
    const node = rows.find((r) => r.node.path === cursorPath)?.node;
    if (!node?.isDir) {
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

  /** カーソル位置のディレクトリ配下を3階層まで展開する (ファイルは展開しない). */
  const expandDeep = useCallback((): void => {
    const node = rows.find((r) => r.node.path === cursorPath)?.node;
    if (!node?.isDir) {
      return;
    }

    const expandRecursive = async (
      n: TreeNode,
      depth: number,
    ): Promise<TreeNode> => {
      if (depth === 0 || !n.isDir) return n;

      const children = !n.loaded
        ? await fetchChildren(n.path, showHidden)
        : n.children;

      const expandedChildren = await Promise.all(
        children.map((child) => expandRecursive(child, depth - 1)),
      );

      return {
        ...n,
        children: expandedChildren,
        empty: n.empty || expandedChildren.length === 0,
        loaded: true,
        expanded: true,
      };
    };

    const current = version.current;
    void expandRecursive(node, 3).then((updated) => {
      if (current !== version.current) {
        return;
      }
      setRoots((prev) => updateNode(prev, node.path, () => updated));
    });
  }, [rows, cursorPath, showHidden]);

  /** カーソル位置のディレクトリ配下をすべて折り畳む. */
  const collapseDeep = useCallback((): void => {
    const node = rows.find((r) => r.node.path === cursorPath)?.node;
    if (!node) {
      return;
    }

    const collapseRecursive = (n: TreeNode): TreeNode => ({
      ...n,
      expanded: false,
      children: n.children.map(collapseRecursive),
    });

    setRoots((prev) => updateNode(prev, node.path, collapseRecursive));
  }, [rows, cursorPath]);

  return {
    rows,
    cursorPath,
    setCursorPath,
    moveCursor,
    expandOrChild,
    collapseOrParent,
    expandDeep,
    collapseDeep,
  };
}
