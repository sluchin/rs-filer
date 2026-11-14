import { describe, expect, it } from "vitest";
import {
  PATH_LIST_SCROLL_STEP,
  filterIndexes,
  filterPaths,
  scrollPathList,
} from "@/features/explorer/pathList";

describe("scrollPathList", () => {
  it("正常系: → で右へ, ← で左へ, 一覧を横にスクロールし, true を返すこと", () => {
    const list = document.createElement("ul");

    expect(scrollPathList(list, "ArrowRight")).toBe(true);
    expect(list.scrollLeft).toBe(PATH_LIST_SCROLL_STEP);
    expect(scrollPathList(list, "ArrowLeft")).toBe(true);
    expect(list.scrollLeft).toBe(0);
  });

  it("正常系: ← → 以外のキーでは, スクロールせずに false を返すこと", () => {
    const list = document.createElement("ul");

    expect(scrollPathList(list, "j")).toBe(false);
    expect(list.scrollLeft).toBe(0);
  });
});

describe("filterPaths", () => {
  const paths = ["/home/Docs/Memo.md", "/home/docs/todo.txt", "/tmp/memo.md"];

  it("正常系: 大文字と小文字を区別せず, 元の順に残すこと", () => {
    expect(filterPaths(paths, "MEMO")).toEqual([
      "/home/Docs/Memo.md",
      "/tmp/memo.md",
    ]);
  });

  it("正常系: 空白で区切った語を, 全て含むものだけを残すこと", () => {
    expect(filterPaths(paths, "docs  memo")).toEqual(["/home/Docs/Memo.md"]);
    expect(filterPaths(paths, "memo zzz")).toEqual([]);
  });

  it("境界: 語がなければ(空, 空白だけ), そのまま返すこと", () => {
    expect(filterPaths(paths, "")).toBe(paths);
    expect(filterPaths(paths, "   ")).toBe(paths);
  });
});

describe("filterIndexes", () => {
  const paths = ["/home/Docs/Memo.md", "/home/docs/todo.txt", "/tmp/memo.md"];

  it("正常系: 合うパスの位置を, 昇順で返すこと. 語がなければ全ての位置を返すこと", () => {
    expect(filterIndexes(paths, "memo")).toEqual([0, 2]);
    expect(filterIndexes(paths, "docs todo")).toEqual([1]);
    expect(filterIndexes(paths, "")).toEqual([0, 1, 2]);
    expect(filterIndexes(paths, "zzz")).toEqual([]);
  });
});
