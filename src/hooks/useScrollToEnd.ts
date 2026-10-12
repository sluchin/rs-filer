import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * 横にあふれた文字列の末尾が見えるよう, 要素を右端までスクロールするフック.
 *
 * ディレクトリのパスは, 先頭 (ルート) より末尾 (いま開いているディレクトリ) の方が大切なので,
 * 長くて入り切らないときは, 末尾を見せます. 文字列が変わったとき, 要素の幅が変わったとき
 * (ペインの幅の変更) に, 右端へそろえ直します.
 *
 * @param text - 表示している文字列. 変わったら, 右端へそろえ直す.
 * @returns 要素に付ける ref と, 右端へスクロールする関数 (入力欄のフォーカスが外れたときなどに呼ぶ).
 */
export function useScrollToEnd<T extends HTMLElement>(text: string) {
  const ref = useRef<T | null>(null);

  const scrollToEnd = useCallback((): void => {
    const element = ref.current;
    if (element) {
      element.scrollLeft = element.scrollWidth;
    }
  }, []);

  useLayoutEffect(() => {
    scrollToEnd();
  }, [text, scrollToEnd]);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(scrollToEnd);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollToEnd]);

  return { ref, scrollToEnd };
}
