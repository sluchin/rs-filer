import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useBookmarks } from "../features/bookmarks/hooks/useBookmarks";

describe("useBookmarks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("正常系: 追加すると localStorage に保存され, 再度呼ぶと解除されること", () => {
    const { result } = renderHook(() => useBookmarks());
    act(() => result.current.toggleBookmark("/a"));
    act(() => result.current.toggleBookmark("/b"));
    expect(result.current.bookmarks).toEqual(["/a", "/b"]);
    expect(JSON.parse(localStorage.getItem("rsfiler.bookmarks") ?? "")).toEqual(
      ["/a", "/b"],
    );

    act(() => result.current.toggleBookmark("/a"));
    expect(result.current.bookmarks).toEqual(["/b"]);
  });

  it("正常系: removeBookmark で解除できること", () => {
    const { result } = renderHook(() => useBookmarks());
    act(() => result.current.toggleBookmark("/a"));
    act(() => result.current.removeBookmark("/a"));
    expect(result.current.bookmarks).toEqual([]);
  });

  it("正常系: 保存済みの内容が起動時に読み込まれること", () => {
    localStorage.setItem("rsfiler.bookmarks", JSON.stringify(["/x", 1, "/y"]));
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.bookmarks).toEqual(["/x", "/y"]);
  });

  it.each(["not json", '{"a":1}'])(
    "異常系: 保存内容 %s が不正な場合は空の一覧になること",
    (value) => {
      localStorage.setItem("rsfiler.bookmarks", value);
      const { result } = renderHook(() => useBookmarks());
      expect(result.current.bookmarks).toEqual([]);
    },
  );

  it("異常系: 保存に失敗しても一覧は更新されること", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { result } = renderHook(() => useBookmarks());
    act(() => result.current.toggleBookmark("/a"));
    expect(result.current.bookmarks).toEqual(["/a"]);
  });
});
