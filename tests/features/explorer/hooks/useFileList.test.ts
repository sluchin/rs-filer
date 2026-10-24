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
} from "@/services/tauriApi";

vi.mock("@/services/tauriApi", () => ({
  getHomeDir: vi.fn(),
  loadConfig: vi.fn(),
  loadHistory: vi.fn(),
  readDirectory: vi.fn(),
  saveHistory: vi.fn(),
  saveLastPaths: vi.fn(),
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
