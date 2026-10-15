/**
 * 名前の一覧を, 先頭の 3 件までにして, 続きがあれば「ほか」を付けます.
 *
 * @param names - 名前の一覧.
 * @returns 表示用の文字列 (例: `a, b, c ほか`).
 */
function listNames(names: string[]): string {
  const more = names.length > 3 ? " ほか" : "";
  return `${names.slice(0, 3).join(", ")}${more}`;
}

/**
 * 同名のものがあるときの, 上書きの確認の文を作ります.
 *
 * 配置先のほうが更新日時が新しいもの (古いもので上書きすることになるもの) があれば, 警告を添えます.
 *
 * @param label - 表示に使う動詞 (コピー・移動).
 * @param conflicts - 同名のものがある対象の名前.
 * @param stale - そのうち, 配置先のほうが更新日時が新しいものの名前.
 * @returns 確認の文.
 */
export function overwriteMessage(
  label: string,
  conflicts: string[],
  stale: string[],
): string {
  const warning =
    stale.length > 0
      ? ` 警告: ${stale.length} 件 (${listNames(stale)}) は, 配置先のほうが更新日時が新しく, 古いもので上書きすることになります.`
      : "";
  return `${conflicts.length} 件が既に存在します (${listNames(conflicts)}).${warning} 上書きして${label}しますか? (y/n)`;
}

/**
 * 同名のディレクトリを統合するときの, ファイル 1 件ごとの上書きの確認の文を作ります.
 *
 * @param name - 確認で表示する名前.
 * @param position - 何件目か (1 から).
 * @param total - 全部で何件か.
 * @param stale - 配置先のほうが更新日時が新しいか.
 * @returns 確認の文.
 */
export function nestedMessage(
  name: string,
  position: number,
  total: number,
  stale: boolean,
): string {
  const warning = stale
    ? " 警告: 配置先のほうが更新日時が新しく, 古いもので上書きすることになります."
    : "";
  return `「${name}」は既に存在します (${position}/${total}).${warning} 上書きしますか?`;
}
