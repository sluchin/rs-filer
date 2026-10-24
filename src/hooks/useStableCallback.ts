import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * 描画のたびに変わる処理を, 同じ関数のまま呼べるようにします.
 *
 * 返す関数は, 最初の描画から変わらず, 呼ばれたときに, 最後に描画したときの `fn` を呼びます.
 * `memo` した子コンポーネントへ渡しても, 描き直しを起こしません. 描画の最中には呼ばないこと
 * (イベントのハンドラーで使う).
 *
 * @param fn - 呼ぶ処理.
 * @returns 変わらない関数.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
