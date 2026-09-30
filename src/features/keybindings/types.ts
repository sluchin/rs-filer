/**
 * キー入力から呼び出されるファイラのコマンド識別子の一覧.
 */
export const COMMANDS = [
  "cursorUp",
  "cursorDown",
  "pageUp",
  "pageDown",
  "cursorFirst",
  "cursorLast",
  "open",
  "openExternal",
  "openEditor",
  "parent",
  "goto",
  "gotoHome",
  "drives",
  "reload",
  "switchPane",
  "mkdir",
  "touch",
  "rename",
  "copy",
  "copyConfirm",
  "copyToClipboard",
  "pasteFromClipboard",
  "duplicate",
  "move",
  "moveConfirm",
  "syncPane",
  "preview",
  "log",
  "delete",
  "deletePermanent",
  "mark",
  "unmark",
  "markAll",
  "unmarkAll",
  "invertMarks",
  "markPattern",
  "toggleHidden",
  "cycleSort",
  "toggleDetails",
  "filter",
  "cancel",
  "historyBack",
  "historyForward",
  "historyList",
  "bookmarks",
  "addBookmark",
  "palette",
  "help",
  "openTerminal",
  "externalCommand",
  "cycleTheme",
  "cycleFontSize",
  "resizeColumnWider",
  "resizeColumnNarrower",
  "autoFitColumn",
  "focusTree",
  "quit",
] as const;

/**
 * キー入力から呼び出されるファイラのコマンド識別子.
 */
export type Command = (typeof COMMANDS)[number];

/**
 * キー入力を解決した結果.
 */
export interface KeyResolution {
  /** 実行するコマンド. 対応するコマンドが無い場合は undefined. */
  command?: Command;
  /** 次のキーを待つプレフィクス (`C-x` など). 待たない場合は undefined. */
  prefix?: string;
}
