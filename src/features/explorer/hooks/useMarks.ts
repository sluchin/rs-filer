import { useCallback } from "react";
import { compilePattern } from "../view";
import type { PaneId, PaneState } from "../types";

/**
 * マーク (複数選択) を扱うフック.
 *
 * @param activePane - アクティブなペイン識別子.
 * @param updatePane - ペインの状態を更新する関数.
 * @param moveCursor - カーソルを上下に動かす関数.
 * @param setError - エラーメッセージを設定する関数.
 * @returns マークを操作するハンドラー. すべて, アクティブなペインが対象.
 */
export function useMarks(
  activePane: PaneId,
  updatePane: (pane: PaneId, updater: (prev: PaneState) => PaneState) => void,
  moveCursor: (pane: PaneId, delta: number) => void,
  setError: (message: string | null) => void,
) {
  /**
   * カーソル位置のエントリのマークを設定または解除し, カーソルを 1 つ下へ動かします.
   *
   * @param marked - true でマーク, false で解除.
   */
  const setCursorMark = useCallback(
    (marked: boolean): void => {
      updatePane(activePane, (prev) => {
        const file = prev.files[prev.selectedIndex];
        if (!file) {
          return prev;
        }
        const others = prev.marks.filter((m) => m !== file.path);
        return { ...prev, marks: marked ? [...others, file.path] : others };
      });
      moveCursor(activePane, 1);
    },
    [activePane, updatePane, moveCursor],
  );

  /** カーソル位置のエントリをマークし, カーソルを 1 つ下へ動かします. */
  const mark = useCallback((): void => setCursorMark(true), [setCursorMark]);

  /** カーソル位置のエントリのマークを解除し, カーソルを 1 つ下へ動かします. */
  const unmark = useCallback((): void => setCursorMark(false), [setCursorMark]);

  /** 表示中のすべてのエントリをマークします. */
  const markAll = useCallback((): void => {
    updatePane(activePane, (prev) => ({
      ...prev,
      marks: prev.files.map((f) => f.path),
    }));
  }, [activePane, updatePane]);

  /** すべてのマークを解除します. */
  const unmarkAll = useCallback((): void => {
    updatePane(activePane, (prev) => ({ ...prev, marks: [] }));
  }, [activePane, updatePane]);

  /** 表示中のエントリのマークを反転します. */
  const invertMarks = useCallback((): void => {
    updatePane(activePane, (prev) => {
      const marked = new Set(prev.marks);
      return {
        ...prev,
        marks: prev.files.map((f) => f.path).filter((p) => !marked.has(p)),
      };
    });
  }, [activePane, updatePane]);

  /**
   * パターンに一致する表示中のエントリを, マークへ追加します.
   *
   * @param pattern - ワイルドカード (`*.txt`) または `/正規表現/`. 空の場合は何もしない.
   */
  const markPattern = useCallback(
    (pattern: string): void => {
      if (pattern.trim() === "") {
        return;
      }
      try {
        setError(null);
        const matches = compilePattern(pattern.trim());
        updatePane(activePane, (prev) => ({
          ...prev,
          marks: [
            ...new Set([
              ...prev.marks,
              ...prev.files.filter((f) => matches(f.name)).map((f) => f.path),
            ]),
          ],
        }));
      } catch (e) {
        setError(`パターンが不正です: ${String(e)}`);
      }
    },
    [activePane, updatePane, setError],
  );

  return { mark, unmark, markAll, unmarkAll, invertMarks, markPattern };
}
