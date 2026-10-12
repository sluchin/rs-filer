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
          { name: "a.txt", path: "/h/a.txt", is_dir: false, hidden: false },
          { name: ".env", path: "/h/.env", is_dir: false, hidden: true },
        ]);
      }
      if (cmd === "read_directory" && path === "/h/docs") {
        return Promise.resolve([
          { name: "sub", path: "/h/docs/sub", is_dir: true, hidden: false },
        ]);
      }
      if (cmd === "dirs_have_entries") {
        const paths = (args as { paths: string[] }).paths;
        // .git だけ, 配下に何も無い.
        return Promise.resolve(paths.map((p) => p !== "/h/.git"));
      }
      return Promise.resolve([]);
    });
  });

  it("正常系: 配下に何も無いディレクトリは empty になり, ある・ファイルのノードは empty にならないこと", async () => {
    const { result } = renderHook(() => useTree("/h", true));

    await waitFor(() => expect(result.current.rows).toHaveLength(5));
    const emptyOf = (name: string): boolean | undefined =>
      result.current.rows.find((r) => r.node.name === name)?.node.empty;
    expect(emptyOf(".git")).toBe(true);
    expect(emptyOf("docs")).toBe(false);
    expect(emptyOf("a.txt")).toBe(false);
    expect(mockedInvoke).toHaveBeenCalledWith("dirs_have_entries", {
      paths: ["/h/.git", "/h/docs"],
      showHidden: true,
    });
  });

  it("正常系: 展開して配下が無いと分かったディレクトリは empty になること", async () => {
    const { result } = renderHook(() => useTree("/h", false));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.expandOrChild());
    await waitFor(() => expect(result.current.rows).toHaveLength(4));
    act(() => result.current.moveCursor(1));
    act(() => result.current.expandOrChild());

    await waitFor(() =>
      expect(
        result.current.rows.find((r) => r.node.name === "sub")?.node.empty,
      ).toBe(true),
    );
  });

  it("異常系: 配下の有無を調べられなくても, 一覧は表示し, empty にしないこと", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "dirs_have_entries") {
        return Promise.reject("失敗");
      }
      const path = (args as { path: string }).path;
      return Promise.resolve(
        path === "/h"
          ? [{ name: "docs", path: "/h/docs", is_dir: true, hidden: false }]
          : [],
      );
    });
    const { result } = renderHook(() => useTree("/h", false));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].node.empty).toBe(false);
  });

  it("正常系: ルート直下を, ディレクトリを先に, ファイルを後に, それぞれ名前順で表示し, 隠しファイルを除くこと", async () => {
    const { result } = renderHook(() => useTree("/h", false));

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows.map((r) => r.node.name)).toEqual([
      "docs",
      "a.txt",
      "b.txt",
    ]);
    expect(result.current.rows.map((r) => r.node.isDir)).toEqual([
      true,
      false,
      false,
    ]);
    expect(result.current.cursorPath).toBe("/h/docs");
  });

  it("正常系: 隠しの表示が有効なら隠しディレクトリと隠しファイルも含むこと", async () => {
    const { result } = renderHook(() => useTree("/h", true));

    await waitFor(() => expect(result.current.rows).toHaveLength(5));
    expect(result.current.rows.map((r) => r.node.name)).toEqual([
      ".git",
      "docs",
      ".env",
      "a.txt",
      "b.txt",
    ]);
  });

  it("境界: ファイルは展開できず, 3 階層展開の対象にもならず, 左で親へ戻れること", async () => {
    const { result } = renderHook(() => useTree("/h", false));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.setCursorPath("/h/a.txt"));
    act(() => result.current.expandOrChild());
    act(() => result.current.expandDeep());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.rows).toHaveLength(3);
    expect(result.current.cursorPath).toBe("/h/a.txt");
    expect(mockedInvoke).not.toHaveBeenCalledWith("read_directory", {
      path: "/h/a.txt",
    });
  });

  it("正常系: 展開で子を読み込み, 展開済みで子へ移動し, 折り畳みで閉じ, 子から親へ戻ること", async () => {
    const { result } = renderHook(() => useTree("/h", false));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.expandOrChild());
    await waitFor(() => expect(result.current.rows).toHaveLength(4));
    expect(result.current.rows[1]).toMatchObject({
      depth: 1,
      node: { path: "/h/docs/sub" },
    });

    act(() => result.current.expandOrChild());
    expect(result.current.cursorPath).toBe("/h/docs/sub");

    act(() => result.current.collapseOrParent());
    expect(result.current.cursorPath).toBe("/h/docs");

    act(() => result.current.collapseOrParent());
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
  });

  it("境界: カーソルは先頭と末尾を越えず, ツリー外の親へは移動しないこと", async () => {
    const { result } = renderHook(() => useTree("/h", false));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.moveCursor(-5));
    expect(result.current.cursorPath).toBe("/h/docs");
    act(() => result.current.moveCursor(5));
    expect(result.current.cursorPath).toBe("/h/b.txt");
    act(() => result.current.setCursorPath("/h/docs"));
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

  describe("refresh (作成・名前変更・削除をツリーに反映する)", () => {
    /** 作成後の状態を模す: 指定したディレクトリの直下に, 新しいディレクトリが加わる. */
    function mockCreated(parent: string, name: string): void {
      const base = mockedInvoke.getMockImplementation();
      mockedInvoke.mockImplementation((cmd, args) => {
        if (
          cmd === "read_directory" &&
          (args as { path: string }).path === parent
        ) {
          return (base?.(cmd, args) as Promise<unknown[]>).then((entries) => [
            ...entries,
            {
              name,
              path: `${parent}/${name}`,
              is_dir: true,
              hidden: name.startsWith("."),
            },
          ]);
        }
        return base?.(cmd, args) as Promise<unknown>;
      });
    }

    it("正常系: 根の直下に作ったものを加えて, カーソルを合わせ, 展開済みのノードの状態を保つこと", async () => {
      const { result } = renderHook(() => useTree("/h", false));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));
      act(() => result.current.expandOrChild()); // docs を展開
      await waitFor(() => expect(result.current.rows).toHaveLength(4));
      mockCreated("/h", "newdir");

      await act(() => result.current.refresh("/h", "newdir"));

      const names = result.current.rows.map((r) => r.node.name);
      expect(names).toContain("newdir");
      // docs は展開されたまま (子の sub が残る).
      expect(names).toContain("sub");
      expect(result.current.cursorPath).toBe("/h/newdir");
    });

    it("正常系: 展開していないディレクトリの下に作ったとき, そのディレクトリを展開して, 作ったものにカーソルを合わせること", async () => {
      const { result } = renderHook(() => useTree("/h", false));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));
      mockCreated("/h/docs", "made");

      await act(() => result.current.refresh("/h/docs", "made"));

      const docs = result.current.rows.find((r) => r.node.name === "docs");
      expect(docs?.node.expanded).toBe(true);
      expect(result.current.rows.map((r) => r.node.name)).toEqual(
        expect.arrayContaining(["docs", "made", "sub"]),
      );
      expect(result.current.cursorPath).toBe("/h/docs/made");
    });

    it("境界: 隠しディレクトリを表示していないとき, 作った隠しディレクトリは出ず, カーソルは動かないこと", async () => {
      const { result } = renderHook(() => useTree("/h", false));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));
      const before = result.current.cursorPath;
      mockCreated("/h", ".secret");

      await act(() => result.current.refresh("/h", ".secret"));

      expect(result.current.rows.map((r) => r.node.name)).not.toContain(
        ".secret",
      );
      expect(result.current.cursorPath).toBe(before);
    });

    /** 指定したディレクトリの直下の一覧を, 差し替える (名前変更・削除のあとの状態を模す). */
    function mockEntries(
      parent: string,
      entries: { name: string; is_dir: boolean }[],
    ): void {
      const base = mockedInvoke.getMockImplementation();
      mockedInvoke.mockImplementation((cmd, args) => {
        if (
          cmd === "read_directory" &&
          (args as { path: string }).path === parent
        ) {
          return Promise.resolve(
            entries.map((e) => ({
              ...e,
              path: `${parent}/${e.name}`,
              hidden: false,
            })),
          );
        }
        return base?.(cmd, args) as Promise<unknown>;
      });
    }

    it("正常系: 名前を変えたとき, 新しい名前のノードにカーソルを合わせ, 古いノードは消えること", async () => {
      const { result } = renderHook(() => useTree("/h", false));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));
      mockEntries("/h", [
        { name: "renamed", is_dir: true },
        { name: "a.txt", is_dir: false },
        { name: "b.txt", is_dir: false },
      ]);

      await act(() => result.current.refresh("/h", "renamed"));

      expect(result.current.rows.map((r) => r.node.name)).toEqual([
        "renamed",
        "a.txt",
        "b.txt",
      ]);
      expect(result.current.cursorPath).toBe("/h/renamed");
    });

    it("正常系: カーソルのノードを削除したとき, 同じ位置の隣のノードへ, 末尾なら一つ前へカーソルが移ること", async () => {
      const { result } = renderHook(() => useTree("/h", false));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));
      act(() => result.current.setCursorPath("/h/a.txt"));
      mockEntries("/h", [
        { name: "docs", is_dir: true },
        { name: "b.txt", is_dir: false },
      ]);

      await act(() => result.current.refresh("/h"));
      expect(result.current.cursorPath).toBe("/h/b.txt");

      // 末尾の b.txt を消すと, 一つ前の docs へ.
      mockEntries("/h", [{ name: "docs", is_dir: true }]);
      await act(() => result.current.refresh("/h"));
      expect(result.current.cursorPath).toBe("/h/docs");
    });

    it("正常系: 全て消えたとき, 根なら何も選ばず, 根でないディレクトリなら, そのディレクトリへ移り, 空のマークを消すこと", async () => {
      const { result } = renderHook(() => useTree("/h", false));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));
      act(() => result.current.expandOrChild()); // docs を展開
      await waitFor(() => expect(result.current.rows).toHaveLength(4));
      act(() => result.current.setCursorPath("/h/docs/sub"));
      mockEntries("/h/docs", []);

      await act(() => result.current.refresh("/h/docs"));

      expect(result.current.cursorPath).toBe("/h/docs");
      expect(
        result.current.rows.find((r) => r.node.name === "docs")?.node.empty,
      ).toBe(true);

      mockEntries("/h", []);
      act(() => result.current.setCursorPath("/h/a.txt"));
      await act(() => result.current.refresh("/h"));
      expect(result.current.cursorPath).toBeNull();
    });

    it("正常系: カーソルが別の場所にあるとき, 他のディレクトリの読み込み直しでは, カーソルを動かさないこと", async () => {
      const { result } = renderHook(() => useTree("/h", false));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));
      act(() => result.current.setCursorPath("/h/b.txt"));
      mockCreated("/h/docs", "made");

      await act(() => result.current.refresh("/h/docs"));

      expect(result.current.cursorPath).toBe("/h/b.txt");
    });
  });
});
