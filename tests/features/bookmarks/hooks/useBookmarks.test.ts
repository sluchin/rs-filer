import { act, renderHook } from "@testing-library/react";
import { useCallback, useState } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useBookmarks } from "@/features/bookmarks/hooks/useBookmarks";
import { DEFAULT_CONFIG, type AppConfig } from "@/features/settings/types";

/** 以前の版がブックマークを保存していた localStorage のキー. */
const LEGACY_KEY = "rsfiler.bookmarks";

/**
 * 設定 (`useSettings`) の代わりに, 状態だけを持つ設定を渡して, フックを描画する.
 *
 * @param bookmarks - 設定ファイルにあるブックマーク (無い場合は undefined).
 * @param loaded - 設定ファイルを読み込めたか.
 */
function renderBookmarks(bookmarks: string[] | undefined, loaded = true) {
  const saved = vi.fn();
  const view = renderHook(() => {
    const [config, setConfig] = useState<AppConfig>({
      ...DEFAULT_CONFIG,
      bookmarks,
    });
    const update = useCallback((patch: Partial<AppConfig>) => {
      saved(patch);
      setConfig((prev) => ({ ...prev, ...patch }));
    }, []);
    return useBookmarks({ config, loaded, update });
  });
  return { ...view, saved };
}

describe("useBookmarks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("正常系: 追加すると設定に保存され, 再度呼ぶと解除されること", () => {
    const { result, saved } = renderBookmarks([]);
    act(() => result.current.toggleBookmark("/a"));
    act(() => result.current.toggleBookmark("/b"));
    expect(result.current.bookmarks).toEqual(["/a", "/b"]);
    expect(saved).toHaveBeenLastCalledWith({ bookmarks: ["/a", "/b"] });

    act(() => result.current.toggleBookmark("/a"));
    expect(result.current.bookmarks).toEqual(["/b"]);
  });

  it("正常系: removeBookmark で解除できること", () => {
    const { result } = renderBookmarks(["/a"]);
    act(() => result.current.removeBookmark("/a"));
    expect(result.current.bookmarks).toEqual([]);
  });

  it("正常系: 区切りが混ざった Windows のパスは, \\ 区切りにそろえて, 重複を除くこと", () => {
    const { result } = renderBookmarks([
      "C:/Users\\foo",
      "C:\\Users\\foo",
      "/x",
    ]);
    expect(result.current.bookmarks).toEqual(["C:\\Users\\foo", "/x"]);
  });

  it("正常系: 設定にまだ無ければ, 以前の版が localStorage に保存したものを取り込み, この起動では消さないこと", () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(["/x", 1, "C:/y"]));
    const { result, saved } = renderBookmarks(undefined);

    expect(saved).toHaveBeenCalledWith({ bookmarks: ["/x", "C:\\y"] });
    expect(result.current.bookmarks).toEqual(["/x", "C:\\y"]);
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it("正常系: 設定に保存済みなら, 以前の版の localStorage の分を消すこと", () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(["/old"]));
    const { result, saved } = renderBookmarks(["/a"]);

    expect(result.current.bookmarks).toEqual(["/a"]);
    expect(saved).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("境界: 設定ファイルを読み込めていないうちは, 取り込まないこと", () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(["/x"]));
    const { result, saved } = renderBookmarks(undefined, false);

    expect(saved).not.toHaveBeenCalled();
    expect(result.current.bookmarks).toEqual([]);
  });

  it("境界: 以前の版の分も無ければ, 何も保存しないこと", () => {
    const { saved } = renderBookmarks(undefined);
    expect(saved).not.toHaveBeenCalled();
  });

  it.each(["not json", '{"a":1}'])(
    "異常系: 以前の版の保存内容 %s が不正な場合は取り込まないこと",
    (value) => {
      localStorage.setItem(LEGACY_KEY, value);
      const { result, saved } = renderBookmarks(undefined);
      expect(saved).not.toHaveBeenCalled();
      expect(result.current.bookmarks).toEqual([]);
    },
  );

  it("異常系: 以前の版の分を消せなくても, 一覧は使えること", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { result } = renderBookmarks(["/a"]);
    expect(result.current.bookmarks).toEqual(["/a"]);
  });
});
