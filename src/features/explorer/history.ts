import { DEFAULT_HISTORY_LIMIT } from "../settings/types";

/**
 * ディレクトリの移動履歴と, その中の現在位置.
 */
export interface HistoryState {
  /** 移動したディレクトリの履歴 (最後に移動した日時の古い順. 同じディレクトリは 1 つだけ). */
  history: string[];
  /** 履歴の中の現在位置. */
  historyIndex: number;
}

/**
 * ディレクトリへ移動したときの, 次の履歴を返します.
 *
 * 移動のたびに, 履歴の末尾へ追加し, 現在位置を末尾にします (戻ったあとに移動しても, 進む側の履歴は捨てません).
 * すでに履歴にあるディレクトリは, 古い位置から除いて末尾へ移します (zsh の `HIST_IGNORE_ALL_DUPS` と同じ).
 * これで, 履歴は移動した順に並び, 同じディレクトリは重複しません.
 * 追加して件数の上限を超えたら, 古い方から捨てます.
 *
 * @param state - 移動する前の履歴.
 * @param targetPath - 移動したディレクトリ.
 * @param limit - 件数の上限 (1 より小さい場合は 1. 今のディレクトリの分).
 * @returns 移動したあとの履歴.
 */
export function pushHistory(
  state: HistoryState,
  targetPath: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
): HistoryState {
  // 今のディレクトリを開き直しただけなら, 同じ配列を返す (変わっていないので保存しない)
  const last = state.history.length - 1;
  if (state.history[last] === targetPath) {
    return { history: state.history, historyIndex: last };
  }
  const appended = [
    ...state.history.filter((p) => p !== targetPath),
    targetPath,
  ];
  const history = appended.slice(
    Math.max(0, appended.length - Math.max(1, limit)),
  );
  return { history, historyIndex: history.length - 1 };
}

/**
 * 履歴から, 指定した位置の 1 件を除いた, 次の履歴を返します.
 *
 * 現在位置は, 除いた件より後ろにあれば 1 つ前へ詰め, 除いた件そのものなら, 同じ番号 (次の件. 末尾なら 1 つ前) に置きます.
 * 位置が範囲の外なら, 同じ履歴を返します.
 *
 * @param state - 除く前の履歴.
 * @param index - 除く件の位置 (0 から).
 * @returns 除いたあとの履歴.
 */
export function removeHistoryEntry(
  state: HistoryState,
  index: number,
): HistoryState {
  if (index < 0 || index >= state.history.length) {
    return state;
  }
  const history = state.history.filter((_, i) => i !== index);
  const historyIndex =
    index < state.historyIndex ? state.historyIndex - 1 : state.historyIndex;
  return { history, historyIndex: Math.min(historyIndex, history.length - 1) };
}
