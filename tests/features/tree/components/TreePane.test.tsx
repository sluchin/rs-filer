import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TreePane from "@/features/tree/components/TreePane";
import { useTree } from "@/features/tree/hooks/useTree";
import type { TreeNode, TreeRow } from "@/features/tree/types";

vi.mock("@/features/tree/hooks/useTree", () => ({ useTree: vi.fn() }));

const node = (path: string, isDir: boolean): TreeNode => ({
  path,
  name: path.split("/").pop() as string,
  isDir,
  empty: false,
  expanded: false,
  loaded: false,
  children: [],
});

const DIR = node("/h/docs", true);
const FILE = node("/h/a.txt", false);

/** useTree の戻り値を差し替える. */
function mockTree(rows: TreeRow[], cursorPath: string | null) {
  const tree = {
    rows,
    cursorPath,
    setCursorPath: vi.fn(),
    moveCursor: vi.fn(),
    expandOrChild: vi.fn(),
    collapseOrParent: vi.fn(),
    expandDeep: vi.fn(),
    collapseDeep: vi.fn(),
    refresh: vi.fn(() => Promise.resolve()),
  };
  vi.mocked(useTree).mockReturnValue(tree);
  return tree;
}

/** ツリーを描画し, ハンドラーを返す. */
function renderTree() {
  const handlers = {
    onActivate: vi.fn(),
    onSelect: vi.fn(),
    onCreateDirectory: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onOpenExternal: vi.fn(),
    onCopyMenu: vi.fn(),
    onCopyText: vi.fn(),
    onCancel: vi.fn(),
    onSwitchPane: vi.fn(),
  };
  render(
    <TreePane
      paneId="left"
      rootPath="/h"
      showHidden={false}
      isActive
      keysEnabled
      {...handlers}
    />,
  );
  return handlers;
}

describe("TreePane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: k と ↑ で上へ, h と ← で折り畳み, Shift+→ で深く展開, Shift+← で深く折り畳むこと", async () => {
    const tree = mockTree([{ node: DIR, depth: 0 }], DIR.path);
    renderTree();
    const user = userEvent.setup();

    await user.keyboard("k{ArrowUp}");
    expect(tree.moveCursor).toHaveBeenNthCalledWith(1, -1);
    expect(tree.moveCursor).toHaveBeenNthCalledWith(2, -1);

    await user.keyboard("h{ArrowLeft}");
    expect(tree.collapseOrParent).toHaveBeenCalledTimes(2);

    await user.keyboard("{Shift>}{ArrowRight}L{/Shift}");
    expect(tree.expandDeep).toHaveBeenCalledTimes(2);

    await user.keyboard("{Shift>}{ArrowLeft}H{/Shift}");
    expect(tree.collapseDeep).toHaveBeenCalledTimes(2);
  });

  it("正常系: N でファイルの行にいるときは, そのファイルのあるディレクトリに作ること", async () => {
    mockTree([{ node: FILE, depth: 0 }], FILE.path);
    const { onCreateDirectory } = renderTree();

    await userEvent.setup().keyboard("N");

    expect(onCreateDirectory).toHaveBeenCalledWith("/h", expect.any(Function));
  });

  it("境界: カーソルの行が無いとき, N は根に作り, Enter・r・d・x・M-w は何もしないこと", async () => {
    mockTree([], null);
    const handlers = renderTree();
    const user = userEvent.setup();

    await user.keyboard("N");
    expect(handlers.onCreateDirectory).toHaveBeenCalledWith(
      "/h",
      expect.any(Function),
    );

    await user.keyboard("{Enter}rdx{Alt>}w{/Alt}");
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(handlers.onRename).not.toHaveBeenCalled();
    expect(handlers.onDelete).not.toHaveBeenCalled();
    expect(handlers.onOpenExternal).not.toHaveBeenCalled();
    expect(handlers.onCopyText).not.toHaveBeenCalled();
  });
});
