import { useCallback, useMemo } from "react";
import type { useSettings } from "../../../hooks/useSettings";
import { uniqueNativePaths } from "../../../utils/path";

/**
 * お気に入りのファイルを管理するフック. 設定ファイル (`config.json` の `favorites`) に保存します.
 *
 * Windows のパスは `\` 区切りにそろえ, 重複を除きます. 一覧は登録した順で, 新しく登録したものが後ろに付きます.
 *
 * @param settings - 設定 (`useSettings`).
 * @returns お気に入りの一覧と, 登録・解除の関数.
 */
export function useFavorites(
  settings: Pick<ReturnType<typeof useSettings>, "config" | "update">,
) {
  const { config, update } = settings;
  const saved = config.favorites;
  const favorites = useMemo(() => uniqueNativePaths(saved ?? []), [saved]);

  /**
   * ファイルをお気に入りへ登録します. 登録済みなら解除します.
   *
   * @param path - 対象のファイルのパス.
   * @returns 登録したら true, 解除したら false.
   */
  const toggleFavorite = useCallback(
    (path: string): boolean => {
      const registered = favorites.includes(path);
      update({
        favorites: registered
          ? favorites.filter((f) => f !== path)
          : [...favorites, path],
      });
      return !registered;
    },
    [favorites, update],
  );

  /**
   * お気に入りを解除します.
   *
   * @param path - 解除するファイルのパス.
   */
  const removeFavorite = useCallback(
    (path: string): void =>
      update({ favorites: favorites.filter((f) => f !== path) }),
    [favorites, update],
  );

  return { favorites, toggleFavorite, removeFavorite };
}
