import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRecentFiles } from "@/features/recent/hooks/useRecentFiles";
import { loadRecentFiles, saveRecentFiles } from "@/services/tauriApi";

vi.mock("@/services/tauriApi", () => ({
  loadRecentFiles: vi.fn(),
  saveRecentFiles: vi.fn(),
}));

const mockedLoad = vi.mocked(loadRecentFiles);
const mockedSave = vi.mocked(saveRecentFiles);

describe("useRecentFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLoad.mockResolvedValue([]);
    mockedSave.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("正常系: 新しい順に並び, 開き直したファイルは最新の位置へ移ること", async () => {
    const { result } = renderHook(() => useRecentFiles());
    await waitFor(() => expect(mockedLoad).toHaveBeenCalled());

    act(() => result.current.record("/a"));
    act(() => result.current.record("/b"));
    act(() => result.current.record("/a"));

    expect(result.current.files).toEqual(["/a", "/b"]);
  });

  it("正常系: 上限を超えた分は, 古いものから捨てること", async () => {
    const { result } = renderHook(() => useRecentFiles(2));
    await waitFor(() => expect(mockedLoad).toHaveBeenCalled());

    act(() => result.current.record("/a"));
    act(() => result.current.record("/b"));
    act(() => result.current.record("/c"));

    expect(result.current.files).toEqual(["/c", "/b"]);
  });

  it("境界: 上限が 0 以下でも, 1 件は残すこと", async () => {
    const { result } = renderHook(() => useRecentFiles(0));
    await waitFor(() => expect(mockedLoad).toHaveBeenCalled());

    act(() => result.current.record("/a"));
    act(() => result.current.record("/b"));

    expect(result.current.files).toEqual(["/b"]);
  });

  it("正常系: 起動前に保存した一覧を, 今回開いたファイルの前に並べること (重複は今回の分を残す)", async () => {
    mockedLoad.mockResolvedValue(["/old", "/dup"]);
    const { result } = renderHook(() => useRecentFiles());
    act(() => result.current.record("/dup"));
    act(() => result.current.record("/now"));

    await waitFor(() =>
      expect(result.current.files).toEqual(["/now", "/dup", "/old"]),
    );
  });

  it("正常系: 読み込んだ一覧も, 上限までにすること", async () => {
    mockedLoad.mockResolvedValue(["/1", "/2", "/3"]);
    const { result } = renderHook(() => useRecentFiles(2));

    await waitFor(() => expect(result.current.files).toEqual(["/3", "/2"]));
  });

  it("正常系: 保存された一覧が無い (undefined) 場合は, 空から始まること", async () => {
    mockedLoad.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useRecentFiles());

    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith([]), {
      timeout: 3000,
    });
    expect(result.current.files).toEqual([]);
  });

  it("正常系: 取り除いたファイルは, 一覧から消えること", async () => {
    const { result } = renderHook(() => useRecentFiles());
    await waitFor(() => expect(mockedLoad).toHaveBeenCalled());
    act(() => result.current.record("/a"));
    act(() => result.current.record("/b"));

    act(() => result.current.remove("/a"));

    expect(result.current.files).toEqual(["/b"]);
  });

  it("正常系: 一覧が変わると, 少し待ってから 1 回だけ保存すること (古い順)", async () => {
    const { result } = renderHook(() => useRecentFiles());
    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    mockedSave.mockClear();

    vi.useFakeTimers();
    act(() => result.current.record("/a"));
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.record("/b"));
    act(() => vi.advanceTimersByTime(999));
    expect(mockedSave).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(mockedSave).toHaveBeenCalledWith(["/a", "/b"]);
  });

  it("異常系: 読み込みに失敗したら, 上書きしないように保存しないこと", async () => {
    mockedLoad.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useRecentFiles());
    await waitFor(() => expect(mockedLoad).toHaveBeenCalled());
    vi.useFakeTimers();
    act(() => result.current.record("/a"));
    act(() => vi.advanceTimersByTime(5000));

    expect(mockedSave).not.toHaveBeenCalled();
    expect(result.current.files).toEqual(["/a"]);
  });

  it("異常系: 保存に失敗しても, 一覧は残ること", async () => {
    mockedSave.mockRejectedValue(new Error("disk"));
    const { result } = renderHook(() => useRecentFiles());
    await waitFor(() => expect(mockedSave).toHaveBeenCalled(), {
      timeout: 3000,
    });

    expect(result.current.files).toEqual([]);
  });

  it("境界: 読み込みの前にアンマウントしたら, 結果を使わないこと", async () => {
    let resolve: (v: string[]) => void = () => {};
    mockedLoad.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = renderHook(() => useRecentFiles());
    unmount();
    await act(async () => resolve([]));

    expect(mockedSave).not.toHaveBeenCalled();
  });
});
