/** パスの一覧 (移動履歴の一覧, ブックマーク一覧) を, `←` `→` で横にスクロールする量 (px). */
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

/**
 * パスの一覧のうち, 入力した文字に合うものの位置 (添字) を返します.
 *
 * 空白で区切った語を全て含むパスだけを残します (大文字と小文字は区別しません. パスは, 名前も含みます).
 * 語がなければ (空, 空白だけ), 全ての位置を返します.
 *
 * @param paths - 絞り込む前のパスの一覧.
 * @param query - 入力した文字.
 * @returns 合うパスの位置 (昇順).
 */
export function filterIndexes(paths: string[], query: string): number[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const indexes: number[] = [];
  paths.forEach((path, i) => {
    const lower = path.toLowerCase();
    if (terms.every((term) => lower.includes(term))) {
      indexes.push(i);
    }
  });
  return indexes;
}

/**
 * パスの一覧を, 入力した文字で絞り込みます. 合うものを元の順に残します (合う条件は, `filterIndexes` と同じ).
 *
 * 語がなければ (空, 空白だけ), 一覧をそのまま返します.
 *
 * @param paths - 絞り込む前のパスの一覧.
 * @param query - 入力した文字.
 * @returns 絞り込んだ一覧.
 */
export function filterPaths(paths: string[], query: string): string[] {
  if (query.trim() === "") {
    return paths;
  }
  return filterIndexes(paths, query).map((i) => paths[i]);
}
