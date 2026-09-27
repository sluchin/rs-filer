import { describe, it, expect } from "vitest";
import type { FileEntry } from "../features/explorer/types";
import {
  compilePattern,
  deriveFiles,
  extensionOf,
  nextSort,
  SORT_CYCLE,
  sortLabel,
} from "../features/explorer/view";

const entry = (name: string, over: Partial<FileEntry> = {}): FileEntry => ({
  name,
  path: `/d/${name}`,
  is_dir: false,
  size: 0,
  modified: null,
  readonly: false,
  hidden: false,
  ...over,
});

const names = (files: FileEntry[]): string[] => files.map((f) => f.name);
const view = {
  showHidden: true,
  sort: { key: "name" as const, desc: false },
  filter: null,
};

describe("extensionOf", () => {
  it.each([
    ["a.TXT", "txt"],
    ["a.tar.gz", "gz"],
    [".bashrc", ""],
    ["Makefile", ""],
  ])("正常系: %s の拡張子は %j であること", (name, expected) => {
    expect(extensionOf(name)).toBe(expected);
  });
});

describe("deriveFiles", () => {
  const all = [
    entry("b.txt", { size: 30, modified: 300 }),
    entry("A.md", { size: 10, modified: 100 }),
    entry("c.js", { size: 20 }),
    entry("dirB", { is_dir: true }),
    entry("dirA", { is_dir: true }),
    entry(".hidden", { hidden: true }),
    entry("file10.txt", { size: 5, modified: 200 }),
    entry("file2.txt", { size: 5, modified: 200 }),
  ];

  it("正常系: 名前順ではディレクトリが先頭に並び, 大文字小文字と数字の並びが考慮されること", () => {
    expect(names(deriveFiles(all, view))).toEqual([
      "dirA",
      "dirB",
      ".hidden",
      "A.md",
      "b.txt",
      "c.js",
      "file2.txt",
      "file10.txt",
    ]);
  });

  it("正常系: 降順でもディレクトリは先頭で, 中身が逆順になること", () => {
    const result = names(
      deriveFiles(all, { ...view, sort: { key: "name", desc: true } }),
    );
    expect(result.slice(0, 2)).toEqual(["dirB", "dirA"]);
    expect(result[2]).toBe("file10.txt");
  });

  it("正常系: 拡張子・サイズ・更新日時でソートできること", () => {
    const by = (key: "ext" | "size" | "date", desc = false): string[] =>
      names(deriveFiles(all, { ...view, sort: { key, desc } })).slice(2);
    expect(by("ext")[0]).toBe(".hidden");
    expect(by("ext")[1]).toBe("c.js");
    expect(by("size")[0]).toBe(".hidden");
    expect(by("size").slice(-1)).toEqual(["b.txt"]);
    expect(by("date").slice(-1)).toEqual(["b.txt"]);
    expect(by("size", true)[0]).toBe("b.txt");
  });

  it("正常系: サイズや日時が無いエントリも並べ替えできること", () => {
    const missing = [
      { ...entry("x"), size: undefined as never },
      { ...entry("y"), size: undefined as never },
    ];
    expect(
      names(
        deriveFiles(missing, { ...view, sort: { key: "size", desc: false } }),
      ),
    ).toEqual(["x", "y"]);
    expect(
      names(deriveFiles(all, { ...view, sort: { key: "date", desc: false } })),
    ).toContain("c.js");
  });

  it("正常系: 隠しファイルを除外できること", () => {
    expect(
      names(deriveFiles(all, { ...view, showHidden: false })),
    ).not.toContain(".hidden");
  });

  it("正常系: 名前の絞り込みは大文字小文字を区別しない部分一致であること", () => {
    expect(names(deriveFiles(all, { ...view, filter: "TXT" }))).toEqual([
      "b.txt",
      "file2.txt",
      "file10.txt",
    ]);
  });
});

describe("compilePattern", () => {
  it("正常系: ワイルドカードは大文字小文字を区別せず, 全体に一致すること", () => {
    const match = compilePattern("*.TXT");
    expect(match("a.txt")).toBe(true);
    expect(match("a.txt.bak")).toBe(false);
    expect(compilePattern("f?le")(" file")).toBe(false);
    expect(compilePattern("f?le")("file")).toBe(true);
  });

  it("正常系: 正規表現の特殊文字はワイルドカードではそのまま扱われること", () => {
    expect(compilePattern("a+b(1).c")("a+b(1).c")).toBe(true);
    expect(compilePattern("a+b(1).c")("aab(1)xc")).toBe(false);
  });

  it("正常系: /で囲むと正規表現になること", () => {
    const match = compilePattern("/^a\\d+$/");
    expect(match("a12")).toBe(true);
    expect(match("b12")).toBe(false);
  });

  it("異常系: 不正な正規表現は例外になること", () => {
    expect(() => compilePattern("/(/")).toThrow();
  });

  it("境界: / だけや //  は正規表現ではなくワイルドカードとして扱われること", () => {
    expect(compilePattern("/")("/")).toBe(true);
    expect(compilePattern("//")("//")).toBe(true);
  });
});

describe("nextSort / sortLabel", () => {
  it("正常系: 次のソートへ進み, 最後は最初に戻ること", () => {
    expect(nextSort(SORT_CYCLE[0])).toEqual(SORT_CYCLE[1]);
    expect(nextSort(SORT_CYCLE[SORT_CYCLE.length - 1])).toEqual(SORT_CYCLE[0]);
  });

  it("正常系: 表示用の文字列になること", () => {
    expect(sortLabel({ key: "name", desc: false })).toBe("名前 ↑");
    expect(sortLabel({ key: "date", desc: true })).toBe("更新日時 ↓");
    expect(sortLabel({ key: "ext", desc: false })).toBe("拡張子 ↑");
    expect(sortLabel({ key: "size", desc: false })).toBe("サイズ ↑");
  });
});
