import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useVirtualRows } from "../features/explorer/hooks/useVirtualRows";

/** jsdom には無い ResizeObserver を, 何もしない実装で補う簡易スタブ. */
class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** clientHeight を固定値で返すようにした, スクロール可能なダミー要素を作る. */
function makeContainer(clientHeight: number): HTMLDivElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientHeight", {
    value: clientHeight,
    configurable: true,
  });
  return el;
}

/** getBoundingClientRect が固定の高さを返すようにした, ダミーの行要素を作る. */
function makeRow(height: number): HTMLLIElement {
  const el = document.createElement("li");
  el.getBoundingClientRect = () => ({ height }) as DOMRect;
  return el;
}

describe("useVirtualRows", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("正常系: 高さが測れるまでは, すべての行を描画する範囲を返すこと", () => {
    const { result } = renderHook(() => useVirtualRows(1000));
    expect(result.current).toMatchObject({
      start: 0,
      end: 1000,
      paddingTop: 0,
      paddingBottom: 0,
    });

    act(() => {
      result.current.containerRef(makeContainer(100));
    });
    // 行の高さがまだ測れていないので, 引き続きすべて描画する.
    expect(result.current).toMatchObject({ start: 0, end: 1000 });
  });

  it("正常系: 高さが測れると, 表示範囲の前後だけを描画する範囲になること", () => {
    const { result } = renderHook(() => useVirtualRows(1000));
    act(() => {
      result.current.containerRef(makeContainer(100));
      result.current.measureRowRef(makeRow(20));
    });

    // clientHeight 100 / rowHeight 20 => 5 行分. overscan 既定 8.
    expect(result.current.start).toBe(0);
    expect(result.current.end).toBe(0 + 5 + 8 * 2);
    expect(result.current.paddingTop).toBe(0);
    expect(result.current.paddingBottom).toBe((1000 - result.current.end) * 20);
  });

  it("正常系: スクロールすると, 描画範囲がその位置に応じて動くこと", () => {
    const { result } = renderHook(() => useVirtualRows(1000, 2));
    let container!: HTMLDivElement;
    act(() => {
      container = makeContainer(100);
      result.current.containerRef(container);
      result.current.measureRowRef(makeRow(20));
    });

    act(() => {
      container.scrollTop = 200;
      container.dispatchEvent(new Event("scroll"));
    });

    // floor(200/20) - overscan(2) = 8.
    expect(result.current.start).toBe(8);
    expect(result.current.paddingTop).toBe(8 * 20);
  });

  it("正常系: scrollToIndex は, 見えていない行だけスクロール位置を動かすこと", () => {
    const { result } = renderHook(() => useVirtualRows(1000));
    let container!: HTMLDivElement;
    act(() => {
      container = makeContainer(100);
      result.current.containerRef(container);
      result.current.measureRowRef(makeRow(20));
    });

    // 下に隠れている行 (50 行目, top=1000) へ.
    act(() => result.current.scrollToIndex(50));
    expect(container.scrollTop).toBe(1000 + 20 - 100);

    // 既に見えている行 (27 行目, top=540..560 は 500..600 の範囲内) では動かさない.
    container.scrollTop = 500;
    act(() => result.current.scrollToIndex(27));
    expect(container.scrollTop).toBe(500);

    // 上に隠れている行 (10 行目, top=200) へ.
    act(() => result.current.scrollToIndex(10));
    expect(container.scrollTop).toBe(200);
  });

  it("境界: 高さが測れていない, またはコンテナが無い間の scrollToIndex は何もしないこと", () => {
    const { result } = renderHook(() => useVirtualRows(1000));
    expect(() => result.current.scrollToIndex(10)).not.toThrow();

    act(() => {
      result.current.containerRef(makeContainer(100));
    });
    expect(() => result.current.scrollToIndex(10)).not.toThrow();
  });

  it("境界: ref に null を渡すと, それ以上追跡しないこと (クリーンアップ)", () => {
    const { result } = renderHook(() => useVirtualRows(1000));
    act(() => {
      result.current.containerRef(makeContainer(100));
      result.current.measureRowRef(makeRow(20));
    });
    expect(result.current.start).toBeDefined();

    act(() => {
      result.current.containerRef(null);
      result.current.measureRowRef(null);
    });
    // null の場合は早期リターンし, 例外にならないこと.
    expect(() => result.current.scrollToIndex(5)).not.toThrow();
  });

  it("境界: ResizeObserver が無い環境でも例外にならないこと", () => {
    const original = globalThis.ResizeObserver;
    // @ts-expect-error -- 未対応環境を再現する.
    delete globalThis.ResizeObserver;
    try {
      const { result } = renderHook(() => useVirtualRows(1000));
      act(() => {
        result.current.containerRef(makeContainer(100));
        result.current.measureRowRef(makeRow(20));
      });
      expect(result.current.start).toBe(0);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
