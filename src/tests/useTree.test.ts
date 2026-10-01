import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useTree } from "../features/tree/hooks/useTree";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

describe("useTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedInvoke.mockImplementation((cmd, args) => {
      const path = (args as { path: string }).path;
      if (cmd === "read_directory" && path === "/h") {
        return Promise.resolve([
          { name: "b.txt", path: "/h/b.txt", is_dir: false, hidden: false },
          { name: "docs", path: "/h/docs", is_dir: true, hidden: false },
          { name: ".git", path: "/h/.git", is_dir: true, hidden: true },
        ]);
      }
      if (cmd === "read_directory" && path === "/h/docs") {
        return Promise.resolve([
          { name: "sub", path: "/h/docs/sub", is_dir: true, hidden: false },
        ]);
      }
      return Promise.resolve([]);
    });
  });

  it("正常系: ルート直下をディレクトリだけ名前順で表示し, ファイルと隠しディレクトリを除くこと", async () => {
    const { result } = renderHook(() => useTree("/h", false));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows.map((r) => r.node.name)).toEqual(["docs"]);
    expect(result.current.cursorPath).toBe("/h/docs");
  });

  it("正常系: 隠しの表示が有効なら隠しディレクトリも含み, ファイルは含まないこと", async () => {
    const { result } = renderHook(() => useTree("/h", true));

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.rows.map((r) => r.node.name)).toEqual([
      ".git",
      "docs",
    ]);
  });

  it("正常系: 展開で子を読み込み, 展開済みで子へ移動し, 折り畳みで閉じ, 子から親へ戻ること", async () => {
    const { result } = renderHook(() => useTree("/h", false));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    act(() => result.current.expandOrChild());
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.rows[1]).toMatchObject({
      depth: 1,
      node: { path: "/h/docs/sub" },
    });

    act(() => result.current.expandOrChild());
    expect(result.current.cursorPath).toBe("/h/docs/sub");

    act(() => result.current.collapseOrParent());
    expect(result.current.cursorPath).toBe("/h/docs");

    act(() => result.current.collapseOrParent());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
  });

  it("境界: カーソルは先頭と末尾を越えず, ツリー外の親へは移動しないこと", async () => {
    const { result } = renderHook(() => useTree("/h", false));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    act(() => result.current.moveCursor(-5));
    expect(result.current.cursorPath).toBe("/h/docs");
    act(() => result.current.moveCursor(5));
    expect(result.current.cursorPath).toBe("/h/docs");
    act(() => result.current.collapseOrParent());
    expect(result.current.cursorPath).toBe("/h/docs");
  });

  it("異常系: 読み込みに失敗しても例外にならず, 行は空のままであること", async () => {
    mockedInvoke.mockRejectedValue("失敗");
    const { result } = renderHook(() => useTree("/h", false));

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.rows).toEqual([]);
    expect(result.current.cursorPath).toBeNull();
  });
});
