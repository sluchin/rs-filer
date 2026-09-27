import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useDiskSpace } from "../features/explorer/hooks/useDiskSpace";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe("useDiskSpace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 取得した空き容量を返すこと", async () => {
    mockedInvoke.mockResolvedValue({ free: 1, total: 2 });
    const { result } = renderHook(() => useDiskSpace("/a"));
    await waitFor(() => expect(result.current).toEqual({ free: 1, total: 2 }));
  });

  it("異常系: 取得に失敗した場合は null を返すこと", async () => {
    mockedInvoke.mockRejectedValue("失敗");
    const { result } = renderHook(() => useDiskSpace("/a"));
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("境界: 完了前にアンマウントされた場合は結果を反映せずエラーにもならないこと", async () => {
    let resolve: (v: unknown) => void = () => {};
    let reject: (e: unknown) => void = () => {};
    mockedInvoke.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const first = renderHook(() => useDiskSpace("/a"));
    first.unmount();
    resolve({ free: 1, total: 2 });

    mockedInvoke.mockReturnValueOnce(
      new Promise((_, r) => {
        reject = r;
      }),
    );
    const second = renderHook(() => useDiskSpace("/b"));
    second.unmount();
    reject("失敗");

    await Promise.resolve();
    expect(first.result.current).toBeNull();
    expect(second.result.current).toBeNull();
  });
});
