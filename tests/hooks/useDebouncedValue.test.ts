import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("正常系: 最初の値は待たずに返し, 変わり続けている間は前の値のまま, 止まったら最後の値を返すこと", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: "a" } },
    );
    expect(result.current).toBe("a");

    rerender({ value: "b" });
    act(() => vi.advanceTimersByTime(60));
    rerender({ value: "c" });
    act(() => vi.advanceTimersByTime(60));
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(40));
    expect(result.current).toBe("c");
  });

  it("境界: 待つ時間が 0 なら, いつも元の値を返すこと", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 0),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    expect(result.current).toBe("b");
  });
});
