import { useCallback, useEffect, useMemo, useRef } from "react";
import log from "loglevel";
import type { useSettings } from "../../../hooks/useSettings";
import { uniqueNativePaths } from "../../../utils/path";

/** 以前の版がブックマークを保存していた localStorage のキー. */
const LEGACY_STORAGE_KEY = "rsfiler.bookmarks";

/**
 * 以前の版が localStorage に保存したブックマークを読み込みます. 読めない場合は空の一覧を返します.
 *
 * @returns ブックマークしたディレクトリのパス.
 */
function loadLegacyBookmarks(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(LEGACY_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string")
      : [];
  } catch (e) {
    log.warn("[React] 以前のブックマークの読み込みに失敗:", e);
    return [];
  }
}

/**
 * 以前の版が localStorage に保存したブックマークを消します.
 */
function removeLegacyBookmarks(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (e) {
    log.warn("[React] 以前のブックマークの削除に失敗:", e);
  }
}

/**
 * ブックマーク (お気に入りディレクトリ) を管理するフック. 設定ファイル (`config.json` の `bookmarks`) に保存します.
 *
 * 設定ファイルにまだブックマークが無い場合は, 以前の版が localStorage に保存したものを取り込みます.
 * localStorage の分は, 設定ファイルに保存されたのを確かめてから (次に起動したときに) 消します.
 * Windows のパスは `\` 区切りにそろえ, 重複を除きます (以前の版で, 区切りが混ざって保存したもの).
 *
 * @param settings - 設定 (`useSettings`). 設定ファイルを読み込めるまでは, 取り込まない.
 * @returns ブックマークの一覧と, 追加・解除の関数.
 */
export function useBookmarks(
  settings: Pick<
    ReturnType<typeof useSettings>,
    "config" | "loaded" | "update"
  >,
) {
  const { config, loaded, update } = settings;
  const saved = config.bookmarks;
  const bookmarks = useMemo(() => uniqueNativePaths(saved ?? []), [saved]);
  /** この起動で, 以前の版のブックマークを取り込んだら true (設定ファイルへの保存を確かめるまで, 元を消さない). */
  const migrated = useRef(false);

  // 以前の版のブックマークを取り込む. 設定ファイルを読めていないうちは, 既定値を保存してしまうので, 取り込まない.
  useEffect(() => {
    if (!loaded) {
      return;
    }
    if (saved !== undefined && saved !== null) {
      if (!migrated.current) {
        removeLegacyBookmarks();
      }
      return;
    }
    const legacy = loadLegacyBookmarks();
    if (legacy.length > 0) {
      migrated.current = true;
      log.info(`[React] 以前のブックマークを取り込み: ${legacy.length} 件`);
      update({ bookmarks: uniqueNativePaths(legacy) });
    }
  }, [loaded, saved, update]);

  /**
   * ディレクトリをブックマークへ追加します. 登録済みなら解除します.
   *
   * @param path - 対象のディレクトリのパス.
   */
  const toggleBookmark = useCallback(
    (path: string): void => {
      update({
        bookmarks: bookmarks.includes(path)
          ? bookmarks.filter((b) => b !== path)
          : [...bookmarks, path],
      });
    },
    [bookmarks, update],
  );

  /**
   * ブックマークを解除します.
   *
   * @param path - 解除するディレクトリのパス.
   */
  const removeBookmark = useCallback(
    (path: string): void =>
      update({ bookmarks: bookmarks.filter((b) => b !== path) }),
    [bookmarks, update],
  );

  return { bookmarks, toggleBookmark, removeBookmark };
}
