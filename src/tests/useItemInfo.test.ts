import { renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDirStats, useItemInfo } from "../features/info/hooks/useItemInfo";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

const INFO = (path: string) => ({
  name: path.split("/").pop(),
  path,
  kind: "file",
  size: 1,
  modified: 1,
  created: null,
  accessed: null,
  readonly: false,
  hidden: false,
  permissions: null,
  symlink_target: null,
  extension: null,
  child_files: null,
  child_dirs: null,
});

describe("useItemInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedInvoke.mockImplementation((cmd, args) =>
      cmd === "get_item_info"
        ? Promise.resolve(INFO((args as { path: string }).path))
        : Promise.resolve(undefined),
    );
  });

  it("正常系: パスが無ければ idle で, 呼び出さないこと", () => {
    const { result } = renderHook(() => useItemInfo(null));

    expect(result.current).toEqual({ status: "idle" });
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("正常系: 取得中は loading, 取得できたら ready になり, パスが変わると取得し直すこと", async () => {
    const { result, rerender } = renderHook(({ path }) => useItemInfo(path), {
      initialProps: { path: "/h/a" as string | null },
    });
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(mockedInvoke).toHaveBeenCalledWith("get_item_info", {
      path: "/h/a",
    });

    rerender({ path: "/h/b" });
    // 古いパスの結果は使わず, 新しいパスの取得が終わるまで loading.
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({ info: { path: "/h/b" } });
  });

  it("異常系: 取得に失敗したら, error とメッセージになること", async () => {
    mockedInvoke.mockRejectedValue("失敗しました");
    const { result } = renderHook(() => useItemInfo("/h/a"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toEqual({
      status: "error",
      message: "失敗しました",
    });
  });
});

describe("useItemInfo (取得中にパスが変わったとき)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("境界: 古いパスの取得が後から終わっても (成功・失敗とも), その結果を使わないこと", async () => {
    let finishOld: { resolve: () => void; reject: () => void } = {
      resolve: () => {},
      reject: () => {},
    };
    mockedInvoke.mockImplementation((_cmd, args) => {
      const path = (args as { path: string }).path;
      if (path === "/h/new") {
        return Promise.resolve(INFO(path));
      }
      return new Promise((resolve, reject) => {
        finishOld = {
          resolve: () => resolve(INFO(path)),
          reject: () => reject("old failed"),
        };
      });
    });
    const { result, rerender } = renderHook(({ path }) => useItemInfo(path), {
      initialProps: { path: "/h/old1" },
    });
    const old1 = finishOld;
    rerender({ path: "/h/old2" });
    const old2 = finishOld;
    rerender({ path: "/h/new" });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    old1.resolve();
    old2.reject();
    await new Promise((r) => setTimeout(r, 10));

    expect(result.current).toMatchObject({
      status: "ready",
      info: { path: "/h/new" },
    });
  });
});

describe("useDirStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: ディレクトリのパスで, 配下の合計を取得すること. パスが null なら呼ばないこと", async () => {
    mockedInvoke.mockResolvedValue({
      files: 3,
      dirs: 1,
      bytes: 10,
      errors: 0,
      complete: true,
    });

    const idle = renderHook(() => useDirStats(null));
    expect(idle.result.current).toEqual({ status: "idle" });
    expect(mockedInvoke).not.toHaveBeenCalled();

    const { result } = renderHook(() => useDirStats("/h/docs"));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(mockedInvoke).toHaveBeenCalledWith("dir_stats", { path: "/h/docs" });
    expect(result.current).toMatchObject({ stats: { files: 3 } });
  });
});
