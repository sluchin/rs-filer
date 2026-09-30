import { useCallback, useEffect, useRef, useState } from "react";
import log from "loglevel";
import {
  getHomeDir,
  listDrives,
  readDirectory,
} from "../../../services/tauriApi";
import type { TreeNode, TreeRow } from "../types";
import { getParentPath } from "../../../utils/path";

/**
 * ツリー表示を管理するフック.
 *
 * @param showHidden - 隠しディレクトリを表示するか.
 * @param currentPath - アクティブペインのカレントパス (変わるたびにツリーカーソルを合わせる).
 * @returns ツリーの状態と操作関数.
 */
export function useTree(showHidden: boolean, currentPath: string) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [cursorPath, setCursorPath] = useState<string | null>(null);
  const [rows, setRows] = useState<TreeRow[]>([]);
  const [rootsLoaded, setRootsLoaded] = useState(false);
  const revealVersion = useRef(0);

  // ルートを読み込む (初回マウント時).
  useEffect(() => {
    const init = async (): Promise<void> => {
      try {
        const [home, drives] = await Promise.all([getHomeDir(), listDrives()]);
        const rootPaths = drives.length > 1 ? drives : [home];
        const newRoots: TreeNode[] = rootPaths.map((path) => ({
          path,
          name:
            path === "/"
              ? "/"
              : path.replace(/\/$/, "").split("/").pop() || path,
          expanded: false,
          loaded: false,
          children: [],
        }));
        setRoots(newRoots);
        setRootsLoaded(true);
      } catch (e) {
        log.error("[React] ツリーのルート読み込み失敗:", e);
      }
    };
    init();
  }, []);

  // ノードの子を読み込む (未読込の場合のみ).
  const loadChildren = useCallback(
    async (node: TreeNode): Promise<TreeNode> => {
      if (node.loaded) {
        return node;
      }
      try {
        const entries = await readDirectory(node.path);
        const dirs = entries
          .filter((e) => e.is_dir && (showHidden || !e.hidden))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((e) => ({
            path: e.path,
            name: e.name,
            expanded: false,
            loaded: false,
            children: [],
          }));
        return { ...node, children: dirs, loaded: true };
      } catch (e) {
        log.error(`[React] ${node.path} の子読み込み失敗:`, e);
        return { ...node, children: [], loaded: true };
      }
    },
    [showHidden],
  );

  // ノードを展開・折り畳みする.
  const toggle = useCallback(
    async (path: string, expand?: boolean): Promise<void> => {
      setRoots((prev) => {
        const updateNode = async (node: TreeNode): Promise<TreeNode> => {
          if (node.path === path) {
            const shouldExpand = expand !== undefined ? expand : !node.expanded;
            if (shouldExpand && !node.loaded) {
              const loaded = await loadChildren(node);
              return { ...loaded, expanded: true };
            }
            return { ...node, expanded: shouldExpand };
          }
          const children = await Promise.all(
            node.children.map((child) => updateNode(child)),
          );
          return { ...node, children };
        };

        Promise.all(prev.map((root) => updateNode(root))).then(setRoots);
        return prev;
      });
    },
    [loadChildren],
  );

  // currentPath までの祖先を展開してカーソルを合わせる.
  const revealPath = useCallback(
    async (path: string): Promise<void> => {
      revealVersion.current += 1;
      const version = revealVersion.current;

      // 祖先をすべて求める.
      const ancestors: string[] = [];
      let current: string | null = path;
      while (current) {
        ancestors.unshift(current);
        current = getParentPath(current);
      }

      // 祖先を順に展開.
      setRoots((prev) => {
        const expandAncestors = async (
          nodes: TreeNode[],
        ): Promise<TreeNode[]> =>
          Promise.all(
            nodes.map(async (node) => {
              if (!ancestors.includes(node.path)) {
                return node;
              }
              const loaded = await loadChildren(node);
              const children = await expandAncestors(loaded.children);
              return { ...loaded, children, expanded: true };
            }),
          );

        expandAncestors(prev).then((newRoots) => {
          if (version === revealVersion.current) {
            setRoots(newRoots);
            setCursorPath(path);
          }
        });
        return prev;
      });
    },
    [loadChildren],
  );

  // 展開済みノードをフラット化.
  useEffect(() => {
    const flatten = (nodes: TreeNode[], depth: number): TreeRow[] => {
      const result: TreeRow[] = [];
      for (const node of nodes) {
        result.push({ node, depth });
        if (node.expanded) {
          result.push(...flatten(node.children, depth + 1));
        }
      }
      return result;
    };
    // 派生状態の更新: roots が変わるたびに rows を再計算する（意図的）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(flatten(roots, 0));
  }, [roots]);

  // currentPath が変わったときにツリーを更新.
  useEffect(() => {
    if (rootsLoaded) {
      revealPath(currentPath);
    }
  }, [rootsLoaded, currentPath, revealPath]);

  // カーソルを移動する.
  const moveCursor = useCallback(
    (delta: number): void => {
      setRows((prev) => {
        const currentIndex = prev.findIndex((r) => r.node.path === cursorPath);
        if (currentIndex < 0) return prev;
        const newIndex = Math.max(
          0,
          Math.min(currentIndex + delta, prev.length - 1),
        );
        setCursorPath(prev[newIndex]?.node.path ?? null);
        return prev;
      });
    },
    [cursorPath],
  );

  // カーソル位置のノードを展開する (展開済みなら最初の子へ).
  const expandOrChild = useCallback((): void => {
    const row = rows.find((r) => r.node.path === cursorPath);
    if (!row) return;

    if (!row.node.expanded) {
      toggle(row.node.path, true);
    } else if (row.node.children.length > 0) {
      setCursorPath(row.node.children[0].path);
    }
  }, [rows, cursorPath, toggle]);

  // カーソル位置のノードを折り畳む (閉じていれば親へ).
  const collapseOrParent = useCallback((): void => {
    const row = rows.find((r) => r.node.path === cursorPath);
    if (!row) return;

    if (row.node.expanded) {
      toggle(row.node.path, false);
    } else {
      const parent = getParentPath(row.node.path);
      if (parent) {
        setCursorPath(parent);
      }
    }
  }, [rows, cursorPath, toggle]);

  return {
    rows,
    cursorPath,
    toggle,
    moveCursor,
    expandOrChild,
    collapseOrParent,
    setCursorPath,
  };
}
