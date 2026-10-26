import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import KeyHintBar from "@/components/KeyHintBar";

describe("KeyHintBar", () => {
  it("正常系: 案内を 1 つずつ別の要素にして, 折り返しが案内の間だけで起きるようにすること", () => {
    const { container } = render(<KeyHintBar />);

    const hints = Array.from(container.querySelectorAll(".key-hint")).map(
      (el) => el.textContent,
    );

    // 1 つの案内は 1 つの要素に入る (途中で分けない). 区切りの空白を含まない.
    expect(hints.length).toBeGreaterThan(20);
    expect(hints).toContain("Tab:ペイン");
    expect(hints).toContain("+:mkdir");
    expect(hints).toContain("C-x C-f:新規ファイル");
    expect(hints.every((h) => h !== null && h.trim() === h)).toBe(true);
    expect(new Set(hints).size).toBe(hints.length);
    expect(container.querySelector(".key-hint-bar")).not.toBeNull();
    expect(screen.getByText("q:終了")).toHaveClass("key-hint");
  });

  it("正常系: ツリー表示のときは, ツリーで使うキーの案内に切り替わり, 一覧用の案内 (コピーなど) は出ないこと", () => {
    const { container } = render(<KeyHintBar mode="tree" />);

    const hints = Array.from(container.querySelectorAll(".key-hint")).map(
      (el) => el.textContent,
    );

    expect(container.querySelector(".key-hint-bar")).toHaveAttribute(
      "data-mode",
      "tree",
    );
    expect(hints).toEqual([
      "Tab:ペイン",
      "n/p:移動",
      "→/l:展開",
      "←/h:折畳/親",
      "S-→/L:3階層展開",
      "S-←/H:全折畳",
      "Enter:開く",
      "x:実行",
      "N:mkdir",
      "+:根にmkdir",
      "r:名前変更",
      "d/D:削除",
      "S-Del:完全削除",
      "w:名前コピー",
      "T/Esc:戻る",
    ]);
    // ツリー表示中は効かないキー (一覧用のコピーなど) を案内しない.
    expect(hints).not.toContain("C:コピー");
  });

  it("正常系: 既定 (mode を指定しない) は一覧用の案内であること", () => {
    const { container } = render(<KeyHintBar />);

    expect(container.querySelector(".key-hint-bar")).toHaveAttribute(
      "data-mode",
      "list",
    );
    expect(screen.getByText("C:コピー")).toBeInTheDocument();
    expect(screen.queryByText("T/Esc:戻る")).not.toBeInTheDocument();
  });
});
