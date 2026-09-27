/**
 * 文字列の並びの, 共通する先頭部分を返します.
 *
 * @param values - 対象の文字列.
 * @returns 共通する先頭部分. 空の配列では空文字.
 */
export function commonPrefix(values: string[]): string {
  if (values.length === 0) {
    return "";
  }
  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (!value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}
