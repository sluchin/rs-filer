import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollToEnd } from "@/hooks/useScrollToEnd";

/** テスト用のコンポーネント. 文字列を横にあふれさせた要素に, フックを付ける. */
function Sample({ text }: { text: string }) {
  const { ref, scrollToEnd } = useScrollToEnd<HTMLDivElement>(text);
  return (
    <div>
      <div ref={ref} data-testid="target">
        {text}
      </div>
      <button onClick={scrollToEnd}>scroll</button>
    </div>
  );
}

describe("useScrollToEnd", () => {
  let scrollWidth = 500;
  let observed: { callback: () => void; disconnect: () => void } | null;

  beforeEach(() => {
    scrollWidth = 500;
    observed = null;
    // jsdom はレイアウトを行わないので, あふれた幅を差し替える.
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get: () => scrollWidth,
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect = vi.fn();
        observe = vi.fn();
        constructor(callback: () => void) {
          observed = { callback, disconnect: this.disconnect };
        }
      },
    );
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    vi.unstubAllGlobals();
  });

  it("正常系: 表示したとき, 右端 (末尾) までスクロールすること", () => {
    render(<Sample text="/very/long/path" />);

    expect(screen.getByTestId("target").scrollLeft).toBe(500);
  });

  it("正常系: 文字列が変わったとき, 右端へそろえ直すこと", () => {
    const { rerender } = render(<Sample text="/a" />);
    scrollWidth = 800;

    rerender(<Sample text="/a/b" />);

    expect(screen.getByTestId("target").scrollLeft).toBe(800);
  });

  it("正常系: 要素の幅が変わったとき (ペインの幅の変更), 右端へそろえ直すこと", () => {
    render(<Sample text="/a" />);
    const target = screen.getByTestId("target");
    target.scrollLeft = 0;
    scrollWidth = 650;

    act(() => observed?.callback());

    expect(target.scrollLeft).toBe(650);
  });

  it("正常系: scrollToEnd を呼ぶと, 右端へスクロールすること (フォーカスが外れたときなど)", () => {
    render(<Sample text="/a" />);
    const target = screen.getByTestId("target");
    target.scrollLeft = 0;

    fireEvent.click(screen.getByText("scroll"));

    expect(target.scrollLeft).toBe(500);
  });

  it("境界: 要素に付ける前に scrollToEnd を呼んでも, 例外にならないこと", () => {
    /** ref を要素に付けないコンポーネント. */
    function Detached() {
      const { scrollToEnd } = useScrollToEnd<HTMLDivElement>("/a");
      return <button onClick={scrollToEnd}>scroll</button>;
    }
    render(<Detached />);

    expect(() => fireEvent.click(screen.getByText("scroll"))).not.toThrow();
  });

  it("正常系: 取り外すとき, 幅の監視を止めること", () => {
    const { unmount } = render(<Sample text="/a" />);

    unmount();

    expect(observed?.disconnect).toHaveBeenCalled();
  });

  it("境界: ResizeObserver が無い環境でも, 例外にならず, 右端へスクロールすること", () => {
    vi.stubGlobal("ResizeObserver", undefined);

    render(<Sample text="/a" />);

    expect(screen.getByTestId("target").scrollLeft).toBe(500);
  });
});
