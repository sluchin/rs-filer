import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDialogs } from "@/hooks/useDialogs";

describe("useDialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 初めは, 何も開いていない", () => {
    const { result } = renderHook(() => useDialogs());

    expect(result.current.previewOn).toBe(false);
    expect(result.current.copyMenu).toBeNull();
    expect(result.current.isBlocking("left")).toBe(false);
  });

  it("正常系: プレビューと詳細は, 一方を出すと, もう一方を消す", () => {
    const { result } = renderHook(() => useDialogs());

    act(() => result.current.togglePreview());
    expect(result.current.previewOn).toBe(true);

    act(() => result.current.toggleInfo());
    expect(result.current.infoOn).toBe(true);
    expect(result.current.previewOn).toBe(false);

    act(() => result.current.togglePreview());
    expect(result.current.previewOn).toBe(true);
    expect(result.current.infoOn).toBe(false);
  });

  it("正常系: ペインの一覧とツリーは, アクティブなペインのものだけがキー操作を止める", () => {
    const { result } = renderHook(() => useDialogs());

    act(() => result.current.openBookmarks("left"));
    expect(result.current.isBlocking("left")).toBe(true);
    expect(result.current.isBlocking("right")).toBe(false);
    act(() => result.current.closeBookmarks("left"));

    act(() => result.current.openHistoryList("right"));
    expect(result.current.isBlocking("right")).toBe(true);
    act(() => result.current.closeHistoryList("right"));

    act(() => result.current.toggleTree("left"));
    expect(result.current.treePanes).toEqual({ left: true, right: false });
    act(() => result.current.closeTree("left"));

    expect(result.current.isBlocking("left")).toBe(false);
    expect(result.current.isBlocking("right")).toBe(false);
  });

  it("正常系: ダイアログ・パレット・メニューは, どちらのペインでもキー操作を止める", () => {
    const { result } = renderHook(() => useDialogs());
    const target = { path: "/a.txt", name: "a.txt", isDir: false };

    act(() => result.current.openLog());
    expect(result.current.isBlocking("right")).toBe(true);
    act(() => result.current.closeLog());

    act(() => result.current.openHelp());
    expect(result.current.isBlocking("right")).toBe(true);
    act(() => result.current.closeHelp());

    act(() => result.current.setPaletteValue("old"));
    act(() => result.current.openPalette());
    // 開くときは, 前の入力を消す.
    expect(result.current.paletteValue).toBe("");
    expect(result.current.isBlocking("right")).toBe(true);
    act(() => result.current.closePalette());

    act(() => result.current.openCopyMenu({ target, x: 1, y: 2 }));
    expect(result.current.copyMenu).toEqual({ target, x: 1, y: 2 });
    expect(result.current.isBlocking("right")).toBe(true);
    act(() => result.current.closeCopyMenu());

    expect(result.current.isBlocking("right")).toBe(false);
  });

  it("正常系: 開く・閉じる操作は, 描き直しても同じ関数のまま", () => {
    const { result } = renderHook(() => useDialogs());
    const before = result.current.closeTree;

    act(() => result.current.togglePreview());

    expect(result.current.closeTree).toBe(before);
  });
});
