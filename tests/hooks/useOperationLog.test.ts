import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useOperationLog } from "@/hooks/useOperationLog";
import { loadOperationLog, saveOperationLog } from "@/services/tauriApi";

vi.mock("@/services/tauriApi", () => ({
  loadOperationLog: vi.fn(),
  saveOperationLog: vi.fn(),
}));

const mockedLoad = vi.mocked(loadOperationLog);
const mockedSave = vi.mocked(saveOperationLog);

describe("useOperationLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLoad.mockResolvedValue([]);
    mockedSave.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("正常系: ログが追加され, 最大件数を超えた分は古いものから捨てられること", async () => {
    const { result } = renderHook(() => useOperationLog());
    await waitFor(() => expect(mockedLoad).toHaveBeenCalled());
    act(() => result.current.addLog("error", "first"));
    expect(result.current.entries[0]).toMatchObject({
      level: "error",
      message: "first",
    });

    act(() => {
      for (let i = 0; i < 5100; i++) {
        result.current.addLog("info", `m${i}`);
      }
    });
    expect(result.current.entries).toHaveLength(5000);
    expect(result.current.entries[0].message).toBe("m100");
    expect(result.current.entries[4999].message).toBe("m5099");
  });

  it("正常系: 起動前に保存したログを読み込み, 今回のログの前に並べること", async () => {
    mockedLoad.mockResolvedValue([
      { time: 1, level: "error", message: "old error" },
      { time: 2, level: "other", message: "old info" },
    ]);
    const { result } = renderHook(() => useOperationLog());
    act(() => result.current.addLog("info", "now"));
    await waitFor(() => expect(result.current.entries).toHaveLength(3));
    expect(result.current.entries.map((e) => [e.level, e.message])).toEqual([
      ["error", "old error"],
      ["info", "old info"],
      ["info", "now"],
    ]);
  });

  it("正常系: 保存されたログが無い (undefined) 場合は, 空から始まること", async () => {
    mockedLoad.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useOperationLog());
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith([]), {
      timeout: 3000,
    });
    expect(result.current.entries).toEqual([]);
  });

  it("正常系: ログが変わると, 少し待ってから 1 回だけ保存すること", async () => {
    const { result } = renderHook(() => useOperationLog());
    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    mockedSave.mockClear();

    vi.useFakeTimers();
    act(() => result.current.addLog("info", "a"));
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.addLog("info", "b"));
    act(() => vi.advanceTimersByTime(999));
    expect(mockedSave).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(mockedSave.mock.calls[0][0].map((e) => e.message)).toEqual([
      "a",
      "b",
    ]);
  });

  it("異常系: 読み込みに失敗したら, 上書きしないように保存しないこと", async () => {
    mockedLoad.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useOperationLog());
    await waitFor(() => expect(mockedLoad).toHaveBeenCalled());
    vi.useFakeTimers();
    act(() => result.current.addLog("info", "a"));
    act(() => vi.advanceTimersByTime(5000));
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("異常系: 保存に失敗しても, ログは残ること", async () => {
    mockedSave.mockRejectedValue(new Error("disk"));
    const { result } = renderHook(() => useOperationLog());
    await waitFor(() => expect(mockedSave).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(result.current.entries).toEqual([]);
  });

  it("境界: 読み込みの前にアンマウントしたら, 結果を使わないこと", async () => {
    let resolve: (v: never[]) => void = () => {};
    mockedLoad.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = renderHook(() => useOperationLog());
    unmount();
    await act(async () => resolve([]));
    expect(mockedSave).not.toHaveBeenCalled();
  });
});
