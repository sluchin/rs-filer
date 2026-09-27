import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePreview } from "../features/preview/hooks/usePreview";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const preview = {
  kind: "text",
  size: 1,
  encoding: "UTF-8",
  text: "a",
  data_url: null,
  truncated: false,
};

describe("usePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: パスが無ければ idle で, 取得しないこと", () => {
    const { result } = renderHook(() => usePreview(null));
    expect(result.current).toEqual({ status: "idle" });
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("正常系: 取得中は loading, 取得後は ready になること", async () => {
    mockedInvoke.mockResolvedValue(preview);
    const { result } = renderHook(() => usePreview("/a"));
    expect(result.current).toEqual({ status: "loading" });
    await waitFor(() =>
      expect(result.current).toEqual({ status: "ready", preview }),
    );
    expect(mockedInvoke).toHaveBeenCalledWith("read_preview", { path: "/a" });
  });

  it("異常系: 取得に失敗した場合は error になること", async () => {
    mockedInvoke.mockRejectedValue("失敗");
    const { result } = renderHook(() => usePreview("/a"));
    await waitFor(() =>
      expect(result.current).toEqual({ status: "error", message: "失敗" }),
    );
  });

  it("境界: 完了前にパスが変わった場合や, アンマウントされた場合は, 古い結果を反映しないこと", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    let rejectSecond: (e: unknown) => void = () => {};
    mockedInvoke
      .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
      .mockReturnValueOnce(
        new Promise((_, r) => {
          rejectSecond = r;
        }),
      );
    const { result, rerender, unmount } = renderHook(
      ({ path }) => usePreview(path),
      { initialProps: { path: "/a" } },
    );
    rerender({ path: "/b" });
    resolveFirst(preview);
    await Promise.resolve();
    expect(result.current).toEqual({ status: "loading" });

    unmount();
    rejectSecond("失敗");
    await Promise.resolve();
    expect(result.current).toEqual({ status: "loading" });
  });
});
