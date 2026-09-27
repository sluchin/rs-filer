import { useCallback, useState } from "react";

/**
 * ミニバッファなどの入力欄で, 実行した値の履歴を参照するフック.
 *
 * `M-p` / `M-n` や上下の矢印キーで, 過去に実行した値をたどれるようにします.
 * 履歴の先頭 (最新) より新しい側へ進むと, たどり始める前の入力に戻ります.
 *
 * @returns 履歴と, 値の記録・参照を行う関数.
 */
export function useHistoryNav() {
  const [entries, setEntries] = useState<string[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  /**
   * 値を履歴へ記録し, 参照位置をリセットします. 直前と同じ値は重複して積みません.
   *
   * @param value - 記録する値.
   */
  const record = useCallback((value: string): void => {
    setEntries((prev) =>
      prev[prev.length - 1] === value ? prev : [...prev, value],
    );
    setIndex(null);
  }, []);

  /**
   * 履歴をたどります.
   *
   * @param delta - -1 で 1 つ過去へ, 1 で 1 つ現在に近い方へ.
   * @param current - たどり始める前の, 入力欄の現在値 (先頭に戻ったときに復元する).
   * @returns たどった先の値. 端に達していて動けない場合は null.
   */
  const move = useCallback(
    (delta: number, current: string): string | null => {
      if (entries.length === 0) {
        return null;
      }
      if (index === null) {
        if (delta > 0) {
          return null;
        }
        setDraft(current);
        const next = entries.length - 1;
        setIndex(next);
        return entries[next];
      }
      const next = index + delta;
      if (next < 0 || next > entries.length) {
        return null;
      }
      if (next === entries.length) {
        setIndex(null);
        return draft;
      }
      setIndex(next);
      return entries[next];
    },
    [entries, index, draft],
  );

  return { record, move };
}
