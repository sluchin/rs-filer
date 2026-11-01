import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFileList } from "@/features/explorer/hooks/useFileList";
import type { FileEntry } from "@/features/explorer/types";
import { DEFAULT_CONFIG } from "@/features/settings/types";
import {
  getHomeDir,
  loadConfig,
  loadHistory,
  readDirectory,
  saveHistory,
  saveLastPaths,
  searchContents,
  searchDirectory,
} from "@/services/tauriApi";

vi.mock("@/services/tauriApi", () => ({
  getHomeDir: vi.fn(),
  loadConfig: vi.fn(),
  loadHistory: vi.fn(),
  readDirectory: vi.fn(),
  saveHistory: vi.fn(),
  saveLastPaths: vi.fn(),
  searchContents: vi.fn(),
  searchDirectory: vi.fn(),
}));

const makeEntry = (name: string, dir = "/test"): FileEntry => ({
  name,
  path: `${dir}/${name}`,
  is_dir: false,
  size: 100,
  modified: 1000,
  readonly: false,
  hidden: false,
});

describe("useFileList 競合状態（Race Condition）の防止", () => {
  const onError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({
      ...DEFAULT_CONFIG,
      last_paths: { left: "/initial", right: "/initial" },
    });
    vi.mocked(loadHistory).mockResolvedValue({ left: [], right: [] });
    vi.mocked(getHomeDir).mockResolvedValue("/home");
    vi.mocked(saveLastPaths).mockResolvedValue();
    vi.mocked(saveHistory).mockResolvedValue();
    vi.mocked(readDirectory).mockResolvedValue([makeEntry("file1.txt")]);
  });

  it("正常系: 遅いリクエストが後に完了しても, 新しいリクエストの結果が上書きされないこと", async () => {
    const { result } = renderHook(() => useFileList(onError));

    // 初期化の完了を待つ
    await waitFor(() => {
      expect(result.current.leftPane.currentPath).toBe("/initial");
    });

    let resolveSlow: (entries: FileEntry[]) => void = () => {};
    const slowPromise = new Promise<FileEntry[]>((resolve) => {
      resolveSlow = resolve;
    });

    vi.mocked(readDirectory).mockImplementation((path: string) => {
      if (path === "/slow") {
        return slowPromise;
      }
      if (path === "/fast") {
        return Promise.resolve([makeEntry("fast.txt", "/fast")]);
      }
      return Promise.resolve([]);
    });

    // /slow を読み込み開始した直後に /fast を読み込み開始
    let slowLoadPromise: Promise<void> | undefined;
    let fastLoadPromise: Promise<void> | undefined;

    act(() => {
      slowLoadPromise = result.current.loadDirectory("left", "/slow");
      fastLoadPromise = result.current.loadDirectory("left", "/fast");
    });

    // /fast は即座に完了するはず
    await act(async () => {
      await fastLoadPromise;
    });

    expect(result.current.leftPane.currentPath).toBe("/fast");
    expect(result.current.leftPane.files.map((f) => f.name)).toEqual([
      "fast.txt",
    ]);

    // その後, 遅れて /slow が完了
    await act(async () => {
      resolveSlow([makeEntry("slow.txt", "/slow")]);
      await slowLoadPromise;
    });

    // /slow で上書きされず, /fast のまま維持されること
    expect(result.current.leftPane.currentPath).toBe("/fast");
    expect(result.current.leftPane.files.map((f) => f.name)).toEqual([
      "fast.txt",
    ]);
  });

  it("異常系: 遅いリクエストが後にエラーになっても, 最新リクエストが成功していればエラーにならないこと", async () => {
    const { result } = renderHook(() => useFileList(onError));

    await waitFor(() => {
      expect(result.current.leftPane.currentPath).toBe("/initial");
    });

    let rejectSlow: (err: Error) => void = () => {};
    const slowPromise = new Promise<FileEntry[]>((_, reject) => {
      rejectSlow = reject;
    });

    vi.mocked(readDirectory).mockImplementation((path: string) => {
      if (path === "/slow_fail") {
        return slowPromise;
      }
      if (path === "/fast_ok") {
        return Promise.resolve([makeEntry("fast_ok.txt", "/fast_ok")]);
      }
      return Promise.resolve([]);
    });

    let slowLoadPromise: Promise<void> | undefined;
    let fastLoadPromise: Promise<void> | undefined;

    act(() => {
      slowLoadPromise = result.current.loadDirectory("left", "/slow_fail");
      fastLoadPromise = result.current.loadDirectory("left", "/fast_ok");
    });

    await act(async () => {
      await fastLoadPromise;
    });

    expect(result.current.leftPane.currentPath).toBe("/fast_ok");
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();

    // 遅れて /slow_fail がエラーで失敗
    await act(async () => {
      rejectSlow(new Error("Disk error"));
      await slowLoadPromise;
    });

    // 古いエラーで上書きされず, エラーなし・/fast_ok のまま維持されること
    expect(result.current.leftPane.currentPath).toBe("/fast_ok");
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("useFileList 再帰検索", () => {
  const onError = vi.fn();
  const found = (path: string): FileEntry => ({
    ...makeEntry(path.split("/").pop() ?? path),
    name: path,
    path: `/initial/${path}`,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({
      ...DEFAULT_CONFIG,
      last_paths: { left: "/initial", right: "/initial" },
    });
    vi.mocked(loadHistory).mockResolvedValue({ left: [], right: [] });
    vi.mocked(getHomeDir).mockResolvedValue("/home");
    vi.mocked(saveLastPaths).mockResolvedValue();
    vi.mocked(saveHistory).mockResolvedValue();
    vi.mocked(readDirectory).mockResolvedValue([makeEntry("file1.txt")]);
  });

  /** 初期化が終わったフックを作る. */
  async function setup() {
    const hook = renderHook(() => useFileList(onError));
    await waitFor(() => {
      expect(hook.result.current.leftPane.currentPath).toBe("/initial");
      expect(hook.result.current.leftPane.allFiles).toHaveLength(1);
    });
    return hook;
  }

  it("正常系: 検索の結果が一覧に出て, マークと絞り込みは解除され, カーソルは先頭に戻る", async () => {
    const { result } = await setup();
    act(() => {
      result.current.updatePane("left", (prev) => ({
        ...prev,
        marks: ["/initial/file1.txt"],
        filter: "x",
        selectedIndex: 0,
      }));
    });
    vi.mocked(searchDirectory).mockResolvedValue({
      entries: [found("sub/b.txt"), found("a.txt")],
      truncated: false,
    });

    await act(async () => {
      await result.current.searchPane("left", "/initial", "name", "txt", false);
    });

    expect(searchDirectory).toHaveBeenCalledWith(
      "/initial",
      "txt",
      false,
      5000,
    );
    const pane = result.current.leftPane;
    expect(pane.currentPath).toBe("/initial");
    expect(pane.files.map((f) => f.name)).toEqual(["a.txt", "sub/b.txt"]);
    expect(pane.search).toEqual({
      kind: "name",
      query: "txt",
      truncated: false,
    });
    expect(pane.marks).toEqual([]);
    expect(pane.filter).toBeNull();
    expect(pane.selectedIndex).toBe(0);
  });

  it("正常系: 件数の上限で打ち切ったことが, 状態に残る", async () => {
    const { result } = await setup();
    vi.mocked(searchDirectory).mockResolvedValue({
      entries: [found("a.txt")],
      truncated: true,
    });

    await act(async () => {
      await result.current.searchPane("left", "/initial", "name", "a", true);
    });

    expect(result.current.leftPane.search).toEqual({
      kind: "name",
      query: "a",
      truncated: true,
    });
    expect(searchDirectory).toHaveBeenCalledWith("/initial", "a", true, 5000);
  });

  it("正常系: 内容の検索は、ファイルの中身を探すコマンドを呼び、種類を状態に残す", async () => {
    const { result } = await setup();
    vi.mocked(searchContents).mockResolvedValue({
      entries: [found("a.txt")],
      truncated: false,
    });

    await act(async () => {
      await result.current.searchPane(
        "left",
        "/initial",
        "content",
        "TODO",
        false,
      );
    });

    expect(searchContents).toHaveBeenCalledWith(
      "/initial",
      "TODO",
      false,
      5000,
    );
    expect(searchDirectory).not.toHaveBeenCalled();
    expect(result.current.leftPane.search).toEqual({
      kind: "content",
      query: "TODO",
      truncated: false,
    });
  });

  it("正常系: ディレクトリを読み込むと, 検索の結果の表示は終わる", async () => {
    const { result } = await setup();
    vi.mocked(searchDirectory).mockResolvedValue({
      entries: [found("a.txt")],
      truncated: false,
    });
    await act(async () => {
      await result.current.searchPane("left", "/initial", "name", "a", false);
    });
    expect(result.current.leftPane.search).not.toBeNull();

    await act(async () => {
      await result.current.loadDirectory("left", "/initial");
    });

    expect(result.current.leftPane.search).toBeNull();
    expect(result.current.leftPane.files.map((f) => f.name)).toEqual([
      "file1.txt",
    ]);
  });

  it("正常系: 検索の途中で別のディレクトリを開いたら, 遅れて届いた検索の結果は捨てる", async () => {
    const { result } = await setup();
    let resolveSearch: (r: {
      entries: FileEntry[];
      truncated: boolean;
    }) => void = () => {};
    vi.mocked(searchDirectory).mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      }),
    );
    let searching: Promise<void> | undefined;
    act(() => {
      searching = result.current.searchPane(
        "left",
        "/initial",
        "name",
        "a",
        false,
      );
    });
    await act(async () => {
      await result.current.loadDirectory("left", "/other");
    });

    await act(async () => {
      resolveSearch({ entries: [found("a.txt")], truncated: false });
      await searching;
    });

    expect(result.current.leftPane.currentPath).toBe("/other");
    expect(result.current.leftPane.search).toBeNull();
  });

  it("異常系: 検索に失敗したら, エラーを設定して通知し, 一覧はそのままにする", async () => {
    const { result } = await setup();
    vi.mocked(searchDirectory).mockRejectedValue(new Error("denied"));

    await act(async () => {
      await result.current.searchPane("left", "/initial", "name", "a", false);
    });

    expect(result.current.error).toBe("Error: denied");
    expect(onError).toHaveBeenCalledWith("Error: denied");
    expect(result.current.leftPane.search).toBeNull();
    expect(result.current.leftPane.files).toHaveLength(1);
  });

  it("異常系: 古い検索が遅れて失敗しても, 新しい読み込みのエラー表示を乱さない", async () => {
    const { result } = await setup();
    let rejectSearch: (e: Error) => void = () => {};
    vi.mocked(searchDirectory).mockReturnValue(
      new Promise((_, reject) => {
        rejectSearch = reject;
      }),
    );
    let searching: Promise<void> | undefined;
    act(() => {
      searching = result.current.searchPane(
        "left",
        "/initial",
        "name",
        "a",
        false,
      );
    });
    await act(async () => {
      await result.current.loadDirectory("left", "/other");
    });

    await act(async () => {
      rejectSearch(new Error("late"));
      await searching;
    });

    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
});
