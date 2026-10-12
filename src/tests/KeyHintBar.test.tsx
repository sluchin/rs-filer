import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import KeyHintBar from "../components/KeyHintBar";

describe("KeyHintBar", () => {
  it("正常系: 案内を 1 つずつ別の要素にして, 折り返しが案内の間だけで起きるようにすること", () => {
    const { container } = render(<KeyHintBar />);

    const hints = Array.from(container.querySelectorAll(".key-hint")).map(
      (el) => el.textContent,
    );

    // 1 つの案内は 1 つの要素に入る (途中で分けない). 区切りの空白を含まない.
    expect(hints.length).toBeGreaterThan(20);
    expect(hints).toContain("Tab:ペイン");
    expect(hints).toContain("N:mkdir");
    expect(hints).toContain("C-x C-f:新規ファイル");
    expect(hints.every((h) => h !== null && h.trim() === h)).toBe(true);
    expect(new Set(hints).size).toBe(hints.length);
    expect(container.querySelector(".key-hint-bar")).not.toBeNull();
    expect(screen.getByText("q:終了")).toHaveClass("key-hint");
  });
});
