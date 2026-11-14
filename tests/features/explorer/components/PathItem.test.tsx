import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PathItem from "@/features/explorer/components/PathItem";

describe("PathItem", () => {
  it("正常系: 名前を上に, フルパスを灰色の欄に表示し, ポップアップに両方を入れること", () => {
    const { container } = render(
      <PathItem path="/home/user/memo.md" isDir={false} />,
    );

    expect(screen.getByText("memo.md")).toHaveClass("path-item-name");
    expect(screen.getByText("/home/user/memo.md")).toHaveClass(
      "full-path",
      "path-item-full",
    );
    expect(container.querySelector(".path-item")).toHaveAttribute(
      "title",
      "memo.md\n/home/user/memo.md",
    );
    expect(container.querySelector("svg")).toHaveAttribute("data-icon", "text");
  });

  it("正常系: ディレクトリには, フォルダのアイコンを付けること", () => {
    const { container } = render(<PathItem path="C:\\Users\\me\\docs" isDir />);

    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("data-icon", "dir");
  });

  it("境界値: 名前のないパス (ルート) は, パスだけを 1 行で表示すること", () => {
    const { container } = render(<PathItem path="/" isDir />);

    expect(screen.getByText("/")).toHaveClass("full-path");
    expect(container.querySelector(".path-item-name")).toBeNull();
    expect(container.querySelector(".path-item")).toHaveAttribute("title", "/");
  });
});
