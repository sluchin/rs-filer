import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStableCallback } from "../hooks/useStableCallback";

describe("useStableCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 描き直しても同じ関数のままで, 最後に描画したときの処理を呼ぶ", () => {
    const first = vi.fn((n: number) => n + 1);
    const second = vi.fn((n: number) => n * 10);
    const { result, rerender } = renderHook(({ fn }) => useStableCallback(fn), {
      initialProps: { fn: first },
    });
    const stable = result.current;

    rerender({ fn: second });

    expect(result.current).toBe(stable);
    expect(stable(3)).toBe(30);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(3);
  });
});
