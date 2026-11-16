import { act, renderHook } from "@testing-library/react";
import { useCallback, useState } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useFavorites } from "@/features/favorites/hooks/useFavorites";
import { DEFAULT_CONFIG, type AppConfig } from "@/features/settings/types";

/**
 * 設定 (`useSettings`) の代わりに, 状態だけを持つ設定を渡して, フックを描画する.
 *
 * @param favorites - 設定ファイルにあるお気に入り (無い場合は undefined).
 */
function renderFavorites(favorites: string[] | undefined) {
  const saved = vi.fn();
  const view = renderHook(() => {
    const [config, setConfig] = useState<AppConfig>({
      ...DEFAULT_CONFIG,
      favorites,
    });
    const update = useCallback((patch: Partial<AppConfig>) => {
      saved(patch);
      setConfig((prev) => ({ ...prev, ...patch }));
    }, []);
    return useFavorites({ config, update });
  });
  return { ...view, saved };
}

describe("useFavorites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 登録すると設定に保存され, 登録済みなら再度呼んでも解除されないこと", () => {
    const { result, saved } = renderFavorites([]);
    act(() => result.current.addFavorite("/a.txt"));
    act(() => result.current.addFavorite("/b.txt"));
    expect(result.current.favorites).toEqual(["/a.txt", "/b.txt"]);
    expect(saved).toHaveBeenLastCalledWith({
      favorites: ["/a.txt", "/b.txt"],
    });

    act(() => result.current.addFavorite("/a.txt"));
    expect(result.current.favorites).toEqual(["/a.txt", "/b.txt"]);
  });

  it("正常系: removeFavorite で解除できること", () => {
    const { result } = renderFavorites(["/a.txt"]);
    act(() => result.current.removeFavorite(["/a.txt"]));
    expect(result.current.favorites).toEqual([]);
  });

  it("境界: 設定にまだお気に入りが無ければ空で, 区切りが混ざった Windows のパスは \\ 区切りにそろえて重複を除くこと", () => {
    expect(renderFavorites(undefined).result.current.favorites).toEqual([]);
    const { result } = renderFavorites([
      "C:/Users\\foo.txt",
      "C:\\Users\\foo.txt",
      "/x",
    ]);
    expect(result.current.favorites).toEqual(["C:\\Users\\foo.txt", "/x"]);
  });
});
