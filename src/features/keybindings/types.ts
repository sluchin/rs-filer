/**
 * キー入力から呼び出されるファイラのコマンド識別子.
 */
export type Command =
  | "cursorUp"
  | "cursorDown"
  | "open"
  | "openExternal"
  | "openEditor"
  | "parent"
  | "goto"
  | "drives"
  | "reload"
  | "switchPane"
  | "mkdir"
  | "touch"
  | "rename"
  | "copy"
  | "delete"
  | "deletePermanent";

/**
 * キー入力を解決した結果.
 */
export interface KeyResolution {
  /** 実行するコマンド. 対応するコマンドが無い場合は undefined. */
  command?: Command;
  /** 次のキーを待つプレフィクス (`C-x` など). 待たない場合は undefined. */
  prefix?: string;
}
