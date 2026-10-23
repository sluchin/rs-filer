/** パスの一覧 (履歴一覧, ブックマーク一覧) を, `←` `→` で横にスクロールする量 (px). */
export const PATH_LIST_SCROLL_STEP = 40;

/**
 * パスの一覧で押されたキーが `←` `→` なら, 一覧を横にスクロールします.
 *
 * パスの一覧は, パスを省略せずに表示するので, ペインに収まらない長いパスは, 横にスクロールして見ます.
 *
 * @param list - スクロールする一覧の要素 (`.file-rows`).
 * @param key - 押されたキー (`KeyboardEvent.key`).
 * @returns スクロールした (`←` `→` だった) 場合は true.
 */
export function scrollPathList(list: HTMLElement, key: string): boolean {
  if (key === "ArrowLeft") {
    list.scrollLeft -= PATH_LIST_SCROLL_STEP;
    return true;
  }
  if (key === "ArrowRight") {
    list.scrollLeft += PATH_LIST_SCROLL_STEP;
    return true;
  }
  return false;
}
