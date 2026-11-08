import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useNotice } from "@/hooks/useNotice";

describe("useNotice", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("正常系: 通知を表示して呼び出し元へ伝え, 一定時間後に消えること", () => {
    vi.useFakeTimers();
    const onNotify = vi.fn();
    const { result } = renderHook(() => useNotice(onNotify));
    expect(result.current.notice).toBeNull();

    act(() => result.current.notify("完了"));
    expect(result.current.notice).toBe("完了");
    expect(onNotify).toHaveBeenCalledWith("完了");

    act(() => vi.advanceTimersByTime(4999));
    expect(result.current.notice).toBe("完了");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.notice).toBeNull();
  });

  it("境界: 続けて通知すると, 最後の通知から数え直すこと", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useNotice(() => {}));
    act(() => result.current.notify("1"));
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.notify("2"));
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.notice).toBe("2");
  });
});
