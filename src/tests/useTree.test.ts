import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useTree } from "../features/tree/hooks/useTree";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

describe("useTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") return Promise.resolve("/home/u");
      if (cmd === "list_drives") return Promise.resolve(["/"]);
      if (cmd === "read_directory") {
        const path = (args as { path: string }).path;
        if (path === "/home/u") {
          return Promise.resolve([
            { name: "docs", path: "/home/u/docs", is_dir: true },
          ]);
        }
        return Promise.resolve([]);
      }
      return Promise.resolve(undefined);
    });
  });

  it("正常系: カレントパスまでの祖先を展開してカーソルを合わせ, 読み込みを繰り返さないこと", async () => {
    const { result } = renderHook(() => useTree(false, "/home/u/docs"));

    await waitFor(() => expect(result.current.cursorPath).toBe("/home/u/docs"));
    expect(result.current.rows.map((r) => r.node.path)).toContain(
      "/home/u/docs",
    );
    const calls = mockedInvoke.mock.calls.filter(
      ([cmd]) => cmd === "read_directory",
    ).length;
    await new Promise((r) => setTimeout(r, 100));
    expect(
      mockedInvoke.mock.calls.filter(([cmd]) => cmd === "read_directory")
        .length,
    ).toBe(calls);
  });

  it("異常系: ルートの読み込みに失敗しても例外にならず, 行は空のままであること", async () => {
    mockedInvoke.mockRejectedValue("失敗");
    const { result } = renderHook(() => useTree(false, "/home/u"));

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.rows).toEqual([]);
  });
});
