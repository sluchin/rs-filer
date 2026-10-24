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
 *
 * @param nodes - 今のツリー.
 * @param path - 更新するノードのパス.
 * @param update - ノードを更新する関数.
 * @returns 更新した新しいツリー (元のツリーは変えない).
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
 * 指定したパスのノードを, ツリーの中から探します.
 *
 * @param nodes - 探すツリー.
 * @param path - 探すノードのパス.
 * @returns 見つかったノード. 無い場合は undefined.
 */
function findNode(nodes: TreeNode[], path: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }
    const found = findNode(node.children, path);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * 読み込み直した子ノードを, 今の子ノードへ重ねます. 既にあるノードは, 展開の状態と子を保ち,
 * 新しいノードだけを足します (読み込み直した順序で返す).
 *
 * @param current - 今の子ノード.
 * @param fresh - 読み込み直した子ノード.
 * @returns 重ねた子ノード.
 */
function mergeChildren(current: TreeNode[], fresh: TreeNode[]): TreeNode[] {
  const byPath = new Map(current.map((node) => [node.path, node]));
  return fresh.map((node) => byPath.get(node.path) ?? node);
}

/**
 * 展開済みのノードをたどって, 表示順の行にします.
 *
 * @param nodes - たどるノード.
 * @param depth - `nodes` の深さ (根は 0).
 * @returns 表示順の行.
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
  // 非同期の処理から, 今のツリーを参照するため.
  const rootsRef = useRef<TreeNode[]>([]);
  useEffect(() => {
    rootsRef.current = roots;
  }, [roots]);

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

  /** ディレクトリのノードを展開・折り畳みする. 未読込のディレクトリを展開するときは子を読み込む. */
  const toggle = useCallback(
    async (node: TreeNode, expand: boolean): Promise<void> => {
      // 呼ぶのは, ディレクトリのとき (展開) と, 展開済みのとき (折り畳み. ファイルは展開されない) だけ
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

  /**
   * 指定したディレクトリの直下を読み込み直して, ツリーに反映する (作成・名前変更・削除のあと).
   *
   * 既にあるノードは, 展開の状態と子を保つ. 読み込み直したディレクトリは, 展開した状態にする
   * (作成先がツリーの根のときは, 根の直下を読み込み直す).
   * `select` の名前のノードがあれば, カーソルをそこへ合わせる. 無く (隠しディレクトリを表示していないなど),
   * カーソルのノードが消えたときは, 同じ位置の隣のノード, 無ければ, そのディレクトリへ移す (根なら, 何も選ばない).
   *
   * @param parentPath - 読み込み直すディレクトリの絶対パス.
   * @param select - カーソルを合わせるノードの名前 (作成・名前変更のあと). 省略した場合は, カーソルを保つ.
   */
  const refresh = useCallback(
    async (parentPath: string, select?: string): Promise<void> => {
      const current = version.current;
      const children = await fetchChildren(parentPath, showHidden);
      if (current !== version.current) {
        return;
      }
      const isRoot = parentPath === rootPath;
      const before = isRoot
        ? rootsRef.current
        : (findNode(rootsRef.current, parentPath)?.children ?? []);
      if (isRoot) {
        setRoots((prev) => mergeChildren(prev, children));
      } else {
        setRoots((prev) =>
          updateNode(prev, parentPath, (n) => ({
            ...n,
            children: mergeChildren(n.children, children),
            empty: children.length === 0,
            loaded: true,
            expanded: true,
          })),
        );
      }
      const wanted =
        select === undefined
          ? undefined
          : children.find((c) => c.name === select);
      if (wanted) {
        setCursorPath(wanted.path);
        return;
      }
      setCursorPath((cursor) => {
        const index = before.findIndex((n) => n.path === cursor);
        if (cursor === null || index < 0) {
          return cursor;
        }
        if (children.some((c) => c.path === cursor)) {
          return cursor;
        }
        // カーソルのノードが消えた (削除・名前変更). 同じ位置の隣へ, 無ければ親へ.
        const neighbor = children[Math.min(index, children.length - 1)];
        return neighbor?.path ?? (isRoot ? null : parentPath);
      });
    },
    [rootPath, showHidden],
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
    refresh,
  };
}
