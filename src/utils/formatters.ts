import type { FileEntry } from "../features/explorer/types";

/**
 * 数値を 2 桁にゼロ埋めします.
 *
 * @param n - 数値.
 * @returns 2 桁の文字列.
 */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * UNIX 時刻 (秒) を, ローカル時刻の `YYYY/MM/DD HH:MM:SS` に整形します.
 *
 * @param secs - UNIX 時刻の秒. 不明な場合は null.
 * @returns 整形した文字列. 不明な場合は空文字.
 */
export function formatDate(secs: number | null | undefined): string {
  if (secs === null || secs === undefined) {
    return "";
  }
  const d = new Date(secs * 1000);
  return (
    `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

/**
 * ファイル一覧に表示するサイズを整形します. ディレクトリは空文字です.
 *
 * @param file - 対象のエントリ.
 * @returns バイト数の文字列. ディレクトリの場合は空文字.
 */
export function formatSize(file: FileEntry): string {
  return file.is_dir ? "" : String(file.size ?? 0);
}

/**
 * 属性を xyzzy 風の文字列に整形します. ディレクトリは `d-w-`, ファイルは `-a-w-` で,
 * 読み取り専用の場合は `w` が `r` に, 隠しファイルの場合は末尾が `h` になります.
 *
 * @param file - 対象のエントリ.
 * @returns 属性の文字列.
 */
export function formatAttributes(file: FileEntry): string {
  const head = file.is_dir ? "d-" : "-a-";
  return `${head}${file.readonly ? "r" : "w"}${file.hidden ? "h" : "-"}`;
}

/**
 * ディスク容量を `54.44GB` のように, 有効数字 4 桁で整形します.
 *
 * @param bytes - バイト数.
 * @returns 単位付きの文字列.
 */
export function formatDiskSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${Number(value.toPrecision(4))}${units[unit]}`;
}

/**
 * バイト数を, `12,345 バイト (12.06KB)` のように, 桁区切りと単位つきで整形します (1KB 未満は, 桁区切りだけ).
 *
 * @param bytes - バイト数.
 * @returns 整形した文字列.
 */
export function formatBytesDetail(bytes: number): string {
  const exact = `${bytes.toLocaleString("en-US")} バイト`;
  return bytes >= 1024 ? `${exact} (${formatDiskSize(bytes)})` : exact;
}
