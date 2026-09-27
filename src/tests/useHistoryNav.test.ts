import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useHistoryNav } from "../hooks/useHistoryNav";

describe("useHistoryNav", () => {
  it("正常系: 上へたどって過去の値を取得し, 下へ戻すと元の入力に戻ること", () => {
    const { result } = renderHook(() => useHistoryNav());
    act(() => result.current.record("first"));
    act(() => result.current.record("second"));

    let value: string | null = null;
    act(() => {
      value = result.current.move(-1, "typing");
    });
    expect(value).toBe("second");

    act(() => {
      value = result.current.move(-1, "typing");
    });
    expect(value).toBe("first");

    act(() => {
      value = result.current.move(1, "typing");
    });
    expect(value).toBe("second");

    act(() => {
      value = result.current.move(1, "typing");
    });
    expect(value).toBe("typing");
  });

  it("境界: 履歴が無い場合や, 端をさらに越える場合は null になること", () => {
    const { result } = renderHook(() => useHistoryNav());
    expect(result.current.move(-1, "x")).toBeNull();

    act(() => result.current.record("only"));
    let value: string | null = "sentinel";
    act(() => {
      value = result.current.move(1, "x");
    });
    expect(value).toBeNull();

    act(() => {
      value = result.current.move(-1, "x");
    });
    expect(value).toBe("only");
    act(() => {
      value = result.current.move(-1, "x");
    });
    expect(value).toBeNull();
  });

  it("正常系: 直前と同じ値は重複して記録しないこと", () => {
    const { result } = renderHook(() => useHistoryNav());
    act(() => result.current.record("a"));
    act(() => result.current.record("a"));
    let first: string | null = null;
    act(() => {
      first = result.current.move(-1, "x");
    });
    expect(first).toBe("a");
    let second: string | null = "sentinel";
    act(() => {
      second = result.current.move(-1, "x");
    });
    expect(second).toBeNull();
  });
});
