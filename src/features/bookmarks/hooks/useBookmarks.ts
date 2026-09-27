import { useCallback, useState } from "react";
import log from "loglevel";

/** ブックマークを保存する localStorage のキー. */
const STORAGE_KEY = "rsfiler.bookmarks";

/**
 * 保存されているブックマークを読み込みます. 読めない場合は空の一覧を返します.
 *
 * @returns ブックマークしたディレクトリのパス.
 */
function loadBookmarks(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string")
      : [];
  } catch (e) {
    log.warn("[React] ブックマークの読み込みに失敗:", e);
    return [];
  }
}

/**
 * ブックマーク (お気に入りディレクトリ) を管理するフック. localStorage に保存します.
 *
 * @returns ブックマークの一覧と, 追加・解除の関数.
 */
export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<string[]>(loadBookmarks);

  /**
   * 新しい一覧を状態と localStorage に反映します.
   */
  const save = useCallback((next: string[]): void => {
    setBookmarks(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      log.warn("[React] ブックマークの保存に失敗:", e);
    }
  }, []);

  /**
   * ディレクトリをブックマークへ追加します. 登録済みなら解除します.
   *
   * @param path - 対象のディレクトリのパス.
   */
  const toggleBookmark = useCallback(
    (path: string): void => {
      save(
        bookmarks.includes(path)
          ? bookmarks.filter((b) => b !== path)
          : [...bookmarks, path],
      );
    },
    [bookmarks, save],
  );

  /**
   * ブックマークを解除します.
   *
   * @param path - 解除するディレクトリのパス.
   */
  const removeBookmark = useCallback(
    (path: string): void => save(bookmarks.filter((b) => b !== path)),
    [bookmarks, save],
  );

  return { bookmarks, toggleBookmark, removeBookmark };
}
