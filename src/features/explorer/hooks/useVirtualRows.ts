import { useCallback, useRef, useState } from "react";

/**
 * 仮想スクロールの計算結果と, それに必要な ref・関数.
 */
export interface VirtualRows {
  /** スクロールする一覧の要素に付ける ref コールバック. */
  containerRef: (element: HTMLElement | null) => void;
  /** 行の高さを測るための ref コールバック. 描画する行のうち, どれか 1 つに付ける. */
  measureRowRef: (element: HTMLElement | null) => void;
  /** 実際に描画する範囲の開始インデックス (含む). */
  start: number;
  /** 実際に描画する範囲の終了インデックス (含まない). */
  end: number;
  /** 開始インデックスの手前を埋める高さ (px). 0 の場合は描画しなくてよい. */
  paddingTop: number;
  /** 終了インデックスの後ろを埋める高さ (px). 0 の場合は描画しなくてよい. */
  paddingBottom: number;
  /** 指定したインデックスの行が見えるように, 必要なだけスクロールする. */
  scrollToIndex: (index: number) => void;
}

/** 描画する範囲の前後に余分に含める行数. */
const OVERSCAN = 8;

/**
 * 大量の行を一覧表示するときに, 画面に映る分の前後だけを描画するための仮想スクロール.
 *
 * コンテナの高さや行の高さがまだ測れていない間 (マウント直後や, テスト環境の jsdom など,
 * レイアウトが計算されない場合を含む) は, 安全側に倒してすべての行を描画する範囲を返す.
 *
 * @param count - 全体の行数.
 * @param overscan - 画面の前後に余分に描画する行数 (既定 8).
 * @returns 描画範囲・パディング・ref コールバック・スクロール関数.
 */
export function useVirtualRows(
  count: number,
  overscan: number = OVERSCAN,
): VirtualRows {
  // スクロール可能な要素そのものは ref で持つ (state には, 再描画の材料になる数値だけを置く).
  const containerNodeRef = useRef<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [rowHeight, setRowHeight] = useState(0);

  // コンテナの ref が付いたときに, スクロール位置と表示領域の高さを追い始める.
  const containerRef = useCallback((element: HTMLElement | null) => {
    containerNodeRef.current = element;
    if (!element) {
      return;
    }
    const handleScroll = (): void => setScrollTop(element.scrollTop);
    handleScroll();
    element.addEventListener("scroll", handleScroll, { passive: true });

    const measure = (): void => setViewportHeight(element.clientHeight);
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(element);

    return () => {
      element.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, []);

  // 実際に描画された行の ref が付いたときに, 1 行分の高さを測る
  // (フォントサイズ・テーマの切り替えでも変わるため, ResizeObserver でも追う).
  const measureRowRef = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }
    const measure = (): void =>
      setRowHeight(element.getBoundingClientRect().height);
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);

  const scrollToIndex = useCallback(
    (index: number): void => {
      const element = containerNodeRef.current;
      if (!element || rowHeight <= 0) {
        return;
      }
      const top = index * rowHeight;
      const bottom = top + rowHeight;
      if (top < element.scrollTop) {
        element.scrollTop = top;
      } else if (bottom > element.scrollTop + element.clientHeight) {
        element.scrollTop = bottom - element.clientHeight;
      }
    },
    [rowHeight],
  );

  if (viewportHeight === 0 || rowHeight === 0) {
    // 測れていない間は, すべての行を描画する (これまでどおりの, 仮想化しない表示).
    return {
      containerRef,
      measureRowRef,
      start: 0,
      end: count,
      paddingTop: 0,
      paddingBottom: 0,
      scrollToIndex,
    };
  }

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  const end = Math.min(count, start + visibleCount + overscan * 2);

  return {
    containerRef,
    measureRowRef,
    start,
    end,
    paddingTop: start * rowHeight,
    paddingBottom: Math.max(0, (count - end) * rowHeight),
    scrollToIndex,
  };
}
