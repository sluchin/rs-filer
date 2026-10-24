import { useEffect, useState } from "react";

/**
 * 値が変わってから, しばらく変わらなかったときに, その値を返します (変わり続けている間は, 前の値のまま).
 *
 * カーソルを続けて動かしている間は, 途中の項目のプレビューや詳細を取得しないために使います.
 * 最初の値は, 待たずにそのまま返します.
 *
 * @param value - 元の値.
 * @param delay - 待つ時間 (ミリ秒). 0 の場合は待たずに, いつも元の値を返す.
 * @returns 最後に `delay` の間変わらなかった値.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return delay > 0 ? debounced : value;
}
