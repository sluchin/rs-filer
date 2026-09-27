import { describe, it, expect } from "vitest";
import { highlight, languageOf } from "../features/preview/languages";

describe("languageOf", () => {
  it.each([
    ["main.rs", "rust"],
    ["App.TSX", "typescript"],
    ["a.js", "javascript"],
    ["x.html", "xml"],
    ["run.sh", "bash"],
    ["conf.toml", "ini"],
    ["a.yml", "yaml"],
    ["README.md", "markdown"],
  ])("正常系: %s の言語は %s であること", (name, expected) => {
    expect(languageOf(name)).toBe(expected);
  });

  it.each(["a.txt", "Makefile", ".bashrc", "constructor", "a.constructor"])(
    "境界: %s は対応する言語が無いこと",
    (name) => {
      expect(languageOf(name)).toBeNull();
    },
  );
});

describe("highlight", () => {
  it("正常系: キーワードが強調され, 特殊文字はエスケープされること", () => {
    const html = highlight("const a = '<x>';", "typescript");
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    expect(html).toContain("&lt;x&gt;");
    expect(html).not.toContain("<x>");
  });

  it("境界: 構文として不正な内容でも例外にならないこと", () => {
    expect(() => highlight("{{{ ]]]", "json")).not.toThrow();
  });
});
