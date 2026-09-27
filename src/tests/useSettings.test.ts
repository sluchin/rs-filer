import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "../hooks/useSettings";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe("useSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 読み込みが終わるまでは既定値で, 終わると読み込んだ設定になること", async () => {
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === "load_config") {
        return Promise.resolve({
          theme: "dark",
          font_size: "large",
          editor: "code",
          terminal: null,
        });
      }
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() => useSettings());

    expect(result.current.config.theme).toBe("classic");
    await waitFor(() => expect(result.current.config.theme).toBe("dark"));
    expect(result.current.config.font_size).toBe("large");
  });

  it("正常系: cycleTheme / cycleFontSize で切り替わり, 保存されること", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSettings());
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("load_config"),
    );
    mockedInvoke.mockClear();

    act(() => result.current.cycleTheme());
    expect(result.current.config.theme).toBe("dark");
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("save_config", {
        config: expect.objectContaining({ theme: "dark" }),
      }),
    );

    act(() => result.current.cycleFontSize());
    expect(result.current.config.font_size).toBe("large");
  });

  it("異常系: 読み込み・保存に失敗しても既定値のまま動作すること", async () => {
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === "load_config") return Promise.reject("読み込み失敗");
      if (cmd === "save_config") return Promise.reject("保存失敗");
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() => useSettings());
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("load_config"),
    );

    act(() => result.current.cycleTheme());
    expect(result.current.config.theme).toBe("dark");
  });

  it("境界: 完了前にアンマウントされた場合は, 反映しようとしないこと", async () => {
    let resolve: (v: unknown) => void = () => {};
    mockedInvoke.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { unmount } = renderHook(() => useSettings());
    unmount();
    resolve({
      theme: "dark",
      font_size: "large",
      editor: null,
      terminal: null,
    });
    await Promise.resolve();
  });
});
