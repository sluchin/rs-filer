import { COMMANDS, type Command } from "./types";
export { commonPrefix } from "../../utils/strings";

/** コマンドの説明 (ミニバッファの候補に表示する). */
export const COMMAND_DESCRIPTIONS: Record<Command, string> = {
  cursorUp: "カーソルを上へ",
  cursorDown: "カーソルを下へ",
  pageUp: "1 ページ上へ",
  pageDown: "1 ページ下へ",
  cursorFirst: "先頭へ",
  cursorLast: "末尾へ",
  open: "ディレクトリへ入る / ファイルを開く",
  openExternal: "関連付けられたアプリで開く",
  openEditor: "エディタで開く",
  parent: "親ディレクトリへ移動",
  goto: "パス入力欄へ移動",
  gotoHome: "ホームディレクトリへ移動",
  drives: "ドライブの選択",
  reload: "再読み込み",
  switchPane: "ペイン切り替え",
  mkdir: "ディレクトリ作成",
  touch: "空ファイル作成",
  rename: "名前の変更",
  copy: "対向ペインへコピー",
  copyConfirm: "確認してから対向ペインへコピー",
  copyToClipboard: "クリップボードへコピー",
  pasteFromClipboard: "クリップボードから貼り付け",
  duplicate: "同じディレクトリ内でコピー",
  move: "対向ペインへ移動",
  moveConfirm: "確認してから対向ペインへ移動",
  syncPane: "反対側のペインを同じディレクトリにする",
  preview: "プレビューの表示 / 非表示",
  log: "操作ログ",
  delete: "ゴミ箱へ移動",
  deletePermanent: "完全に削除",
  mark: "マークして下へ",
  unmark: "マーク解除して下へ",
  markAll: "全マーク",
  unmarkAll: "全マーク解除",
  invertMarks: "マーク反転",
  markPattern: "パターンでマーク",
  toggleHidden: "隠しファイルの表示 / 非表示",
  cycleSort: "ソートの切り替え",
  toggleDetails: "詳細列の表示 / 非表示",
  filter: "ファイル名の絞り込み",
  cancel: "キャンセル",
  historyBack: "履歴を戻る",
  historyForward: "履歴を進む",
  historyList: "ディレクトリ移動履歴の一覧",
  bookmarks: "ブックマーク一覧",
  addBookmark: "ブックマークへ登録 / 解除",
  palette: "コマンドの実行",
  help: "コマンド一覧の表示",
  openTerminal: "カレントディレクトリでターミナルを開く",
  externalCommand: "選択したファイルに外部コマンドを実行",
  cycleTheme: "テーマの切り替え",
  cycleFontSize: "フォントサイズの切り替え",
  resizeColumnWider: "選択中の列を広くする",
  resizeColumnNarrower: "選択中の列を狭くする",
  autoFitColumn: "選択中の列の幅を自動調整",
  focusTree: "ツリーペインへフォーカス",
  quit: "終了",
};

/** コマンド名の別名 (xyzzy のファイラのコマンド名). */
const ALIASES: Record<string, Command> = {
  refresh: "reload",
  find: "filter",
  up: "parent",
  copy_as: "duplicate",
  exit: "quit",
};

/**
 * ミニバッファで入力できるコマンド名の一覧を返します. コマンド名の自分自身 (`palette`) は含みません.
 *
 * @returns 名前順のコマンド名 (別名を含む).
 */
export function commandNames(): string[] {
  return [
    ...COMMANDS.filter((c) => c !== "palette"),
    ...Object.keys(ALIASES),
  ].sort();
}

/**
 * ミニバッファで入力されたコマンド名を, コマンドにします.
 *
 * @param name - 入力されたコマンド名 (大文字小文字を区別しない).
 * @returns コマンド. 存在しない場合や `palette` の場合は null.
 */
export function resolveCommandName(name: string): Command | null {
  const wanted = name.trim().toLowerCase();
  const found =
    COMMANDS.find((c) => c.toLowerCase() === wanted) ??
    Object.entries(ALIASES).find(([alias]) => alias === wanted)?.[1];
  return found && found !== "palette" ? found : null;
}
