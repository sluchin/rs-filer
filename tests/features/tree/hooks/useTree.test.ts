import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useTree } from "@/features/tree/hooks/useTree";

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

  describe("3 階層の展開・折り畳み, カーソルが無いとき, 読み込みの追い越し", () => {
    /** 指定したディレクトリの直下を, 差し替える. */
    function mockDir(
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

    /** 指定したディレクトリの読み込みを, 返した関数を呼ぶまで待たせる. */
    function deferDir(parent: string): () => void {
      const base = mockedInvoke.getMockImplementation();
      let release = (): void => {};
      const gate = new Promise<void>((r) => {
        release = r;
      });
      mockedInvoke.mockImplementation((cmd, args) => {
        const result = base?.(cmd, args) as Promise<unknown>;
        if (
          cmd === "read_directory" &&
          (args as { path: string }).path === parent
        ) {
          return gate.then(() => result);
        }
        return result;
      });
      return release;
    }

    /** 処理待ちの Promise を, 全て進める. */
    const flush = () => act(() => new Promise((r) => setTimeout(r, 20)));

    it("正常系: 3 階層まで展開し, 4 階層目は展開せず, ファイルは展開しないこと", async () => {
      mockDir("/h/docs/sub", [
        { name: "deep", is_dir: true },
        { name: "f.txt", is_dir: false },
      ]);
      mockDir("/h/docs/sub/deep", [{ name: "deeper", is_dir: true }]);
      const { result } = renderHook(() => useTree("/h", false));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));

      act(() => result.current.expandDeep()); // docs (カーソルは先頭)

      await waitFor(() =>
        expect(result.current.rows.map((r) => r.node.name)).toEqual([
          "docs",
          "sub",
          "deep",
          "deeper",
          "f.txt",
          "a.txt",
          "b.txt",
        ]),
      );
      const nodeOf = (name: string) =>
        result.current.rows.find((r) => r.node.name === name)?.node;
      expect(nodeOf("deep")?.expanded).toBe(true);
      expect(nodeOf("deeper")?.expanded).toBe(false);
      expect(nodeOf("f.txt")?.expanded).toBe(false);
    });

    it("正常系: 読み込み済みのディレクトリは読み直さずに展開し, 空と分かっているディレクトリは空のままにすること", async () => {
      const { result } = renderHook(() => useTree("/h", true));
      await waitFor(() => expect(result.current.rows).toHaveLength(5));
      act(() => result.current.setCursorPath("/h/docs"));
      act(() => result.current.expandOrChild());
      await waitFor(() => expect(result.current.rows).toHaveLength(6));
      const reads = (path: string) =>
        mockedInvoke.mock.calls.filter(
          (c) =>
            c[0] === "read_directory" &&
            (c[1] as { path: string }).path === path,
        ).length;

      act(() => result.current.expandDeep());
      await flush();
      expect(reads("/h/docs")).toBe(1);
      expect(
        result.current.rows.find((r) => r.node.name === "sub")?.node.expanded,
      ).toBe(true);

      act(() => result.current.setCursorPath("/h/.git"));
      act(() => result.current.expandDeep());
      await flush();
      const git = result.current.rows.find((r) => r.node.name === ".git")?.node;
      expect(git?.empty).toBe(true);
      expect(git?.expanded).toBe(true);
    });

    it("正常系: 配下をすべて折り畳むこと", async () => {
      const { result } = renderHook(() => useTree("/h", false));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));
      act(() => result.current.expandDeep());
      await waitFor(() => expect(result.current.rows).toHaveLength(4));

      act(() => result.current.collapseDeep());

      expect(result.current.rows).toHaveLength(3);
      const docs = result.current.rows[0].node;
      expect(docs.expanded).toBe(false);
      expect(docs.children[0].expanded).toBe(false);
    });

    it("境界: 展開済みで子の無いディレクトリでは, 子へ移らないこと", async () => {
      mockDir("/h/docs", []);
      const { result } = renderHook(() => useTree("/h", false));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));
      act(() => result.current.expandOrChild());
      await flush();

      act(() => result.current.expandOrChild());

      expect(result.current.cursorPath).toBe("/h/docs");
    });

    it("境界: 行もカーソルも無いとき, 各操作は何もしないこと", async () => {
      mockDir("/h", []);
      const { result } = renderHook(() => useTree("/h", false));
      await flush();

      act(() => result.current.moveCursor(1));
      act(() => result.current.collapseOrParent());
      act(() => result.current.collapseDeep());

      expect(result.current.cursorPath).toBeNull();
      expect(result.current.rows).toEqual([]);
    });

    it("正常系: 入れ子のディレクトリを読み込み直して, 展開し, 作ったものにカーソルを合わせること", async () => {
      const { result } = renderHook(() => useTree("/h", false));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));
      act(() => result.current.expandOrChild());
      await waitFor(() => expect(result.current.rows).toHaveLength(4));
      mockDir("/h/docs/sub", [{ name: "made", is_dir: true }]);

      await act(() => result.current.refresh("/h/docs/sub", "made"));

      expect(result.current.cursorPath).toBe("/h/docs/sub/made");
      expect(
        result.current.rows.find((r) => r.node.name === "sub")?.node.expanded,
      ).toBe(true);
    });

    it("境界: ツリーに無いディレクトリを読み込み直したときは, 前の子を空として扱うこと", async () => {
      const { result } = renderHook(() => useTree("/h", false));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));
      act(() => result.current.expandOrChild());
      await waitFor(() => expect(result.current.rows).toHaveLength(4));
      act(() => result.current.setCursorPath("/h/docs/sub"));

      await act(() => result.current.refresh("/h/none"));

      expect(result.current.cursorPath).toBe("/h/docs/sub");
      expect(result.current.rows).toHaveLength(4);
    });

    it("境界: 読み込み中に根が変わったら, 古い読み込みの結果を捨てること", async () => {
      const releaseRoot = deferDir("/h");
      const { result, rerender } = renderHook(
        ({ root }) => useTree(root, false),
        { initialProps: { root: "/h" } },
      );
      rerender({ root: "/h/docs" });
      await waitFor(() => expect(result.current.rows).toHaveLength(1));

      releaseRoot();
      await flush();

      expect(result.current.rows.map((r) => r.node.name)).toEqual(["sub"]);
    });

    it("境界: 展開・3 階層の展開・読み込み直しの途中で根が変わったら, その結果を捨てること", async () => {
      const { result, rerender } = renderHook(
        ({ root }) => useTree(root, false),
        { initialProps: { root: "/h" } },
      );
      await waitFor(() => expect(result.current.rows).toHaveLength(3));
      const releaseDocs = deferDir("/h/docs");

      act(() => result.current.expandOrChild());
      act(() => result.current.expandDeep());
      const refreshing = result.current.refresh("/h/docs");
      rerender({ root: "/h/docs" });
      releaseDocs();
      await act(() => refreshing);
      await flush();

      expect(result.current.rows.map((r) => r.node.name)).toEqual(["sub"]);
      expect(result.current.rows[0].node.expanded).toBe(false);
    });
  });
});
