import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_KEYMAP } from "../features/keybindings/keymap";
import { useUserKeymap } from "../features/keybindings/hooks/useUserKeymap";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe("useUserKeymap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 読み込みが終わるまでは既定のキーマップを返し, 終わると上書きが反映されること", async () => {
    mockedInvoke.mockResolvedValue({ "C-j": "cursorDown" });
    const onWarning = vi.fn();
    const { result } = renderHook(() => useUserKeymap(onWarning));

    expect(result.current).toBe(DEFAULT_KEYMAP);
    await waitFor(() => expect(result.current.get("C-j")).toBe("cursorDown"));
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("異常系: 不正な設定は警告として報告されること", async () => {
    mockedInvoke.mockResolvedValue({ "X-k": "cursorDown" });
    const onWarning = vi.fn();
    renderHook(() => useUserKeymap(onWarning));
    await waitFor(() =>
      expect(onWarning).toHaveBeenCalledWith(
        expect.stringContaining("キーの表記が不正です"),
      ),
    );
  });

  it("異常系: 読み込みに失敗しても, 既定のキーマップのままであること", async () => {
    mockedInvoke.mockRejectedValue("読み込み失敗");
    const onWarning = vi.fn();
    const { result } = renderHook(() => useUserKeymap(onWarning));
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalled());
    expect(result.current).toBe(DEFAULT_KEYMAP);
  });

  it("境界: 完了前にアンマウントされても, 反映しようとしないこと", async () => {
    let resolve: (v: unknown) => void = () => {};
    mockedInvoke.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { unmount } = renderHook(() => useUserKeymap(vi.fn()));
    unmount();
    resolve({ "C-j": "cursorDown" });
    await Promise.resolve();
  });
});
