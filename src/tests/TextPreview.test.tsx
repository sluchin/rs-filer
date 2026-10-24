import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import TextPreview, {
  renderHighlighted,
} from "../features/preview/components/TextPreview";

describe("TextPreview", () => {
  it("正常系: 対応する言語がある場合はシンタックスハイライトされた要素が描画されること", () => {
    const { container } = render(
      <TextPreview name="test.ts" text="const a = 1;" />,
    );
    const keyword = container.querySelector(".hljs-keyword");
    expect(keyword).not.toBeNull();
    expect(keyword).toHaveTextContent("const");
  });

  it("正常系: 対応する言語が無い場合はプレーンテキストとして描画されること", () => {
    const { container } = render(
      <TextPreview name="sample.txt" text="Hello world" />,
    );
    expect(container.querySelector(".preview-text")).toHaveTextContent(
      "Hello world",
    );
    expect(container.querySelector("span")).toBeNull();
  });
});

describe("renderHighlighted", () => {
  it("正常系: span要素と安全なhljsクラス名が保持されること", () => {
    const html =
      '<span class="hljs-keyword">let</span> x = <span class="hljs-number">42</span>;';
    const { container } = render(<code>{renderHighlighted(html)}</code>);
    const keyword = container.querySelector("span.hljs-keyword");
    const number = container.querySelector("span.hljs-number");
    expect(keyword).toHaveTextContent("let");
    expect(number).toHaveTextContent("42");
  });

  it("正常系: ネストされたspan要素が正しく保持されること", () => {
    const html =
      '<span class="hljs-string">prefix <span class="hljs-subst">nested</span> suffix</span>';
    const { container } = render(<code>{renderHighlighted(html)}</code>);
    const outer = container.querySelector("span.hljs-string");
    const inner = container.querySelector("span.hljs-subst");
    expect(outer).not.toBeNull();
    expect(inner).not.toBeNull();
    expect(outer).toHaveTextContent("prefix nested suffix");
    expect(inner).toHaveTextContent("nested");
  });

  it("セキュリティ: scriptタグやimgタグなどの危険な要素は除去され, テキストのみ安全に描画されること", () => {
    const html =
      '<script>alert("xss")</script><img src="x" onerror="evil()" /><p>paragraph</p><span>safe</span>';
    const { container } = render(<code>{renderHighlighted(html)}</code>);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("p")).toBeNull();
    expect(container).toHaveTextContent("paragraphsafe");
  });

  it("セキュリティ: hljs以外の不正なクラス名や属性は無視されること", () => {
    const html =
      '<span class="evil-class hljs-keyword" style="color:red" onclick="alert(1)">val</span>';
    const { container } = render(<code>{renderHighlighted(html)}</code>);
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.className).toBe("hljs-keyword");
    expect(span?.getAttribute("style")).toBeNull();
    expect(span?.getAttribute("onclick")).toBeNull();
  });

  it("境界: クラス名の無いspanは要素化されず子要素のみ展開されること", () => {
    const html = "<span>plain text</span>";
    const { container } = render(<code>{renderHighlighted(html)}</code>);
    expect(container.querySelector("span")).toBeNull();
    expect(container).toHaveTextContent("plain text");
  });

  it("境界: コメントノードなどの非テキスト・非要素ノードは無視されること", () => {
    const html = '<span class="hljs-comment"><!-- comment -->text</span>';
    const { container } = render(<code>{renderHighlighted(html)}</code>);
    expect(container).toHaveTextContent("text");
  });
});
