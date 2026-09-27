import type { FileEntry, SortKey, SortOption } from "./types";

/**
 * 表示の絞り込み・並べ替えに使う設定.
 */
export interface ViewOptions {
  /** 隠しファイルを表示するかどうか. */
  showHidden: boolean;
  /** ソートの設定. */
  sort: SortOption;
  /** 名前の絞り込み文字列. 絞り込み中でない場合は null. */
  filter: string | null;
}

/** `s` キーで順に切り替えるソートの設定. */
export const SORT_CYCLE: SortOption[] = [
  { key: "name", desc: false },
  { key: "name", desc: true },
  { key: "ext", desc: false },
  { key: "ext", desc: true },
  { key: "size", desc: false },
  { key: "size", desc: true },
  { key: "date", desc: false },
  { key: "date", desc: true },
];

/** ソートの基準の表示名. */
const SORT_LABELS: Record<SortKey, string> = {
  name: "名前",
  ext: "拡張子",
  size: "サイズ",
  date: "更新日時",
};

/**
 * ソートの設定を, `名前 ↑` のような表示用の文字列にします.
 *
 * @param sort - ソートの設定.
 * @returns 表示用の文字列.
 */
export function sortLabel(sort: SortOption): string {
  return `${SORT_LABELS[sort.key]} ${sort.desc ? "↓" : "↑"}`;
}

/**
 * 次のソートの設定を返します. 最後の次は最初に戻ります.
 *
 * @param current - 現在のソートの設定.
 * @returns 次のソートの設定.
 */
export function nextSort(current: SortOption): SortOption {
  const index = SORT_CYCLE.findIndex(
    (s) => s.key === current.key && s.desc === current.desc,
  );
  return SORT_CYCLE[(index + 1) % SORT_CYCLE.length];
}

/**
 * ファイル名の拡張子 (小文字, ドットなし) を返します. 先頭のドットだけの名前 (`.bashrc`) は拡張子なしです.
 *
 * @param name - ファイル名.
 * @returns 拡張子. 無い場合は空文字.
 */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * 名前を, 大文字小文字と数字の並びを考慮して比較します.
 */
function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * 2 つのエントリを比較します. ディレクトリは常にファイルより上に並びます.
 */
function compareEntries(a: FileEntry, b: FileEntry, sort: SortOption): number {
  if (a.is_dir !== b.is_dir) {
    return a.is_dir ? -1 : 1;
  }
  let result = 0;
  if (!a.is_dir) {
    if (sort.key === "ext") {
      result = extensionOf(a.name).localeCompare(extensionOf(b.name));
    } else if (sort.key === "size") {
      result = (a.size ?? 0) - (b.size ?? 0);
    } else if (sort.key === "date") {
      result = (a.modified ?? 0) - (b.modified ?? 0);
    }
  }
  if (result === 0) {
    result = compareNames(a.name, b.name);
  }
  return sort.desc ? -result : result;
}

/**
 * 全エントリから, 表示するエントリの一覧を作ります.
 *
 * 隠しファイルの除外, 名前の絞り込み (大文字小文字を区別しない部分一致), ソートを適用します.
 *
 * @param all - ディレクトリ内のすべてのエントリ.
 * @param view - 表示の設定.
 * @returns 表示するエントリの一覧.
 */
export function deriveFiles(all: FileEntry[], view: ViewOptions): FileEntry[] {
  const needle = (view.filter ?? "").toLowerCase();
  return all
    .filter(
      (f) =>
        (view.showHidden || !f.hidden) && f.name.toLowerCase().includes(needle),
    )
    .sort((a, b) => compareEntries(a, b, view.sort));
}

/**
 * ワイルドカード (`*` と `?`) または `/正規表現/` のパターンを, 名前の判定関数にします.
 *
 * @param pattern - パターン. `/` で囲むと正規表現, それ以外はワイルドカード (大文字小文字を区別しない).
 * @returns 名前がパターンに一致するかを返す関数.
 * @throws 正規表現として不正な場合.
 */
export function compilePattern(pattern: string): (name: string) => boolean {
  if (pattern.length > 2 && pattern.startsWith("/") && pattern.endsWith("/")) {
    const regex = new RegExp(pattern.slice(1, -1));
    return (name) => regex.test(name);
  }
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${source}$`, "i");
  return (name) => regex.test(name);
}
