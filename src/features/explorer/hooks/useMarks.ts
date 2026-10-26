import { useCallback } from "react";
import { compilePattern } from "../view";
import type { FileEntry, PaneId, PaneState } from "../types";

/**
 * マーク (複数選択) と, 削除の印 (Emacs の Dired の `D`) を扱うフック.
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
   * カーソル位置のエントリの印 (マークか, 削除の印) を変え, カーソルを 1 つ下へ動かします.
   * 1 つのエントリには, 印を 1 つだけ付けます (Emacs の Dired と同じ. マークすると, 削除の印は外れる).
   *
   * @param kind - `mark` でマーク, `flag` で削除の印, `none` で印を外す.
   */
  const setCursorMark = useCallback(
    (kind: "mark" | "flag" | "none"): void => {
      updatePane(activePane, (prev) => {
        const file = prev.files[prev.selectedIndex];
        if (!file) {
          return prev;
        }
        const marks = prev.marks.filter((m) => m !== file.path);
        const flags = prev.flags.filter((m) => m !== file.path);
        return {
          ...prev,
          marks: kind === "mark" ? [...marks, file.path] : marks,
          flags: kind === "flag" ? [...flags, file.path] : flags,
        };
      });
      moveCursor(activePane, 1);
    },
    [activePane, updatePane, moveCursor],
  );

  /** カーソル位置のエントリをマークし, カーソルを 1 つ下へ動かします (`dired-mark`). */
  const mark = useCallback((): void => setCursorMark("mark"), [setCursorMark]);

  /**
   * カーソル位置のエントリに削除の印を付け, カーソルを 1 つ下へ動かします (`dired-flag-file-deletion`).
   * 印を付けたものは, `x` (`dired-do-flagged-delete`) で削除します.
   */
  const flag = useCallback((): void => setCursorMark("flag"), [setCursorMark]);

  /** カーソル位置のエントリの印 (マークと削除の印) を外し, カーソルを 1 つ下へ動かします (`dired-unmark`). */
  const unmark = useCallback(
    (): void => setCursorMark("none"),
    [setCursorMark],
  );

  /**
   * 表示中のエントリのうち, 合うものに印を付けます. 付けたものの, もう一方の印は外します.
   *
   * @param kind - `mark` でマーク, `flag` で削除の印.
   * @param matches - 印を付けるエントリか.
   */
  const addMarks = useCallback(
    (kind: "mark" | "flag", matches: (file: FileEntry) => boolean): void => {
      updatePane(activePane, (prev) => {
        const paths = prev.files.filter(matches).map((f) => f.path);
        const added = new Set(paths);
        const [same, other] =
          kind === "mark" ? [prev.marks, prev.flags] : [prev.flags, prev.marks];
        const merged = [...new Set([...same, ...paths])];
        const rest = other.filter((m) => !added.has(m));
        return {
          ...prev,
          marks: kind === "mark" ? merged : rest,
          flags: kind === "flag" ? merged : rest,
        };
      });
    },
    [activePane, updatePane],
  );

  /** 表示中のすべてのエントリをマークします (`* s`, `dired-mark-subdir-files`). */
  const markAll = useCallback(
    (): void => addMarks("mark", () => true),
    [addMarks],
  );

  /** すべての印 (マークと削除の印) を外します (`U`, `dired-unmark-all-marks`). */
  const unmarkAll = useCallback((): void => {
    updatePane(activePane, (prev) => ({ ...prev, marks: [], flags: [] }));
  }, [activePane, updatePane]);

  /**
   * 表示中のエントリのマークを反転します (`t`, `dired-toggle-marks`).
   * 削除の印を付けたものは, そのままにします (Dired と同じ).
   */
  const invertMarks = useCallback((): void => {
    updatePane(activePane, (prev) => {
      const marked = new Set(prev.marks);
      const flagged = new Set(prev.flags);
      return {
        ...prev,
        marks: prev.files
          .map((f) => f.path)
          .filter((p) => !marked.has(p) && !flagged.has(p)),
      };
    });
  }, [activePane, updatePane]);

  /**
   * パターンに一致する表示中のエントリに, 印を付けます.
   *
   * @param kind - `mark` でマーク, `flag` で削除の印.
   * @param pattern - ワイルドカード (`*.txt`) または `/正規表現/`. 空の場合は何もしない.
   */
  const addPatternMarks = useCallback(
    (kind: "mark" | "flag", pattern: string): void => {
      if (pattern.trim() === "") {
        return;
      }
      try {
        setError(null);
        const matches = compilePattern(pattern.trim());
        addMarks(kind, (f) => matches(f.name));
      } catch (e) {
        setError(`パターンが不正です: ${String(e)}`);
      }
    },
    [addMarks, setError],
  );

  /**
   * パターンに一致する表示中のエントリを, マークへ追加します (`* %`, `% m`, `dired-mark-files-regexp`).
   *
   * @param pattern - ワイルドカード (`*.txt`) または `/正規表現/`. 空の場合は何もしない.
   */
  const markPattern = useCallback(
    (pattern: string): void => addPatternMarks("mark", pattern),
    [addPatternMarks],
  );

  /**
   * パターンに一致する表示中のエントリに, 削除の印を付けます (`% d`, `dired-flag-files-regexp`).
   *
   * @param pattern - ワイルドカード (`*.txt`) または `/正規表現/`. 空の場合は何もしない.
   */
  const flagPattern = useCallback(
    (pattern: string): void => addPatternMarks("flag", pattern),
    [addPatternMarks],
  );

  return {
    mark,
    flag,
    unmark,
    markAll,
    unmarkAll,
    invertMarks,
    markPattern,
    flagPattern,
  };
}
