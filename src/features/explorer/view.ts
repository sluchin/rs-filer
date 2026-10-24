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
 * 自然順 (数値対応) かつ大文字小文字を区別しない名前比較用の Collator インスタンス.
 * localeCompare は呼び出し毎に Collator を生成して高コストになるため, モジュールレベルでキャッシュして再利用する.
 */
const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * 名前を, 大文字小文字を区別せず, 数字の並びを数値として比較します.
 */
function compareNames(a: string, b: string): number {
  return nameCollator.compare(a, b);
}

/**
 * シュワルツ変換用のソートキー事前計算済みエントリ.
 */
interface DecoratedEntry {
  entry: FileEntry;
  ext: string;
  size: number;
  date: number;
}

/**
 * 2 つのエントリを比較します. ディレクトリは常にファイルより上に並びます (昇順・降順に関わらず).
 * ディレクトリ同士は, 基準に関わらず名前で比較します.
 */
function compareDecorated(
  a: DecoratedEntry,
  b: DecoratedEntry,
  sort: SortOption,
): number {
  if (a.entry.is_dir !== b.entry.is_dir) {
    return a.entry.is_dir ? -1 : 1;
  }
  let result = 0;
  if (!a.entry.is_dir) {
    if (sort.key === "ext") {
      result = nameCollator.compare(a.ext, b.ext);
    } else if (sort.key === "size") {
      result = a.size - b.size;
    } else if (sort.key === "date") {
      result = a.date - b.date;
    }
  }
  if (result === 0) {
    result = compareNames(a.entry.name, b.entry.name);
  }
  return sort.desc ? -result : result;
}

/**
 * 全エントリから, 表示するエントリの一覧を作ります.
 *
 * 隠しファイルの除外, 名前の絞り込み (大文字小文字を区別しない部分一致), ソートを適用します.
 * シュワルツ変換により各エントリの比較キー (拡張子・サイズ・更新日時) を事前計算し,
 * キャッシュした Intl.Collator を用いて高速にソートします.
 *
 * @param all - ディレクトリ内のすべてのエントリ.
 * @param view - 表示の設定.
 * @returns 表示するエントリの一覧.
 */
export function deriveFiles(all: FileEntry[], view: ViewOptions): FileEntry[] {
  const needle = (view.filter ?? "").toLowerCase();
  const isExt = view.sort.key === "ext";

  const decorated: DecoratedEntry[] = [];
  for (const f of all) {
    if (
      (view.showHidden || !f.hidden) &&
      f.name.toLowerCase().includes(needle)
    ) {
      decorated.push({
        entry: f,
        ext: isExt && !f.is_dir ? extensionOf(f.name) : "",
        size: f.size ?? 0,
        date: f.modified ?? 0,
      });
    }
  }

  decorated.sort((a, b) => compareDecorated(a, b, view.sort));

  return decorated.map((d) => d.entry);
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
    // `/.../` で囲まれている場合は, 中身をそのまま正規表現として使う.
    const regex = new RegExp(pattern.slice(1, -1));
    return (name) => regex.test(name);
  }
  // ワイルドカードとして扱う: 正規表現の特殊文字は無効化してから, `*`/`?` だけを有効にする.
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${source}$`, "i");
  return (name) => regex.test(name);
}
