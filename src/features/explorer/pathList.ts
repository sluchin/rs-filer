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

/** 一覧で `PageUp` `PageDown` が動かす行数 (通常のペインと同じ). */
export const PATH_LIST_PAGE_SIZE = 10;

/**
 * 一覧のカーソルを動かすキーなら, 動かしたあとのカーソルの位置を返します. 通常のペインと同じキーに応じます.
 *
 * - 1 行下: `↓` `j` `n` `Space` `C-n`
 * - 1 行上: `↑` `k` `p` `C-p`
 * - 1 ページ下 / 上: `PageDown` / `PageUp` `M-v`
 * - 先頭 / 末尾: `Home` `M-<` / `End` `M->`
 *
 * @param event - キーイベント.
 * @param index - 今のカーソルの位置.
 * @param count - 行数.
 * @returns 動かしたあとの位置 (0 から行数 - 1 の範囲). カーソルを動かすキーでなければ null.
 */
export function moveListCursor(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey">,
  index: number,
  count: number,
): number | null {
  const { key } = event;
  let delta: number | null = null;
  if (event.ctrlKey) {
    delta = key === "n" ? 1 : key === "p" ? -1 : null;
  } else if (event.altKey) {
    if (key === "v") {
      delta = -PATH_LIST_PAGE_SIZE;
    } else if (key === "<") {
      delta = -Infinity;
    } else if (key === ">") {
      delta = Infinity;
    }
  } else if (["ArrowDown", "j", "n", " "].includes(key)) {
    delta = 1;
  } else if (["ArrowUp", "k", "p"].includes(key)) {
    delta = -1;
  } else if (key === "PageDown") {
    delta = PATH_LIST_PAGE_SIZE;
  } else if (key === "PageUp") {
    delta = -PATH_LIST_PAGE_SIZE;
  } else if (key === "Home") {
    delta = -Infinity;
  } else if (key === "End") {
    delta = Infinity;
  }
  if (delta === null) {
    return null;
  }
  return Math.min(Math.max(0, count - 1), Math.max(0, index + delta));
}
