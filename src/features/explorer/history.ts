/**
 * ディレクトリの移動履歴と, その中の現在位置.
 */
export interface HistoryState {
  /** 移動したディレクトリの履歴 (古い順. 同じディレクトリは 1 つだけ). */
  history: string[];
  /** 履歴の中の現在位置. */
  historyIndex: number;
}

/**
 * ディレクトリへ移動したときの, 次の履歴を返します.
 *
 * 移動のたびに, 履歴の末尾へ追加します (戻ったあとに移動しても, 進む側の履歴は捨てません).
 * すでに履歴にあるディレクトリは追加せず, 現在位置をその位置へ合わせます.
 *
 * @param state - 移動する前の履歴.
 * @param targetPath - 移動したディレクトリ.
 * @returns 移動したあとの履歴.
 */
export function pushHistory(
  state: HistoryState,
  targetPath: string,
): HistoryState {
  const found = state.history.indexOf(targetPath);
  if (found >= 0) {
    return { history: state.history, historyIndex: found };
  }
  const history = [...state.history, targetPath];
  return { history, historyIndex: history.length - 1 };
}
