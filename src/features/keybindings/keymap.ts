import type { Command, KeyResolution } from "./types";

/** 修飾キーなしの単独キーに対するコマンドの割り当て. */
const PLAIN_KEYS: Record<string, Command> = {
  ArrowUp: "cursorUp",
  k: "cursorUp",
  ArrowDown: "cursorDown",
  j: "cursorDown",
  Enter: "open",
  f: "open",
  l: "open",
  ArrowRight: "open",
  x: "openExternal",
  e: "openEditor",
  Backspace: "parent",
  h: "parent",
  "^": "parent",
  ArrowLeft: "parent",
  g: "goto",
  F5: "reload",
  R: "reload",
  Tab: "switchPane",
  N: "mkdir",
  "+": "mkdir",
  F2: "rename",
  r: "rename",
  c: "copy",
  Delete: "delete",
  d: "delete",
  D: "deletePermanent",
  " ": "mark",
  u: "unmark",
  U: "unmarkAll",
  ".": "toggleHidden",
  s: "cycleSort",
  i: "toggleDetails",
  "/": "filter",
  b: "bookmarks",
  Escape: "cancel",
};

/** Ctrl を併用する単独キーに対するコマンドの割り当て. */
const CTRL_KEYS: Record<string, Command> = {
  l: "reload",
  a: "markAll",
  s: "filter",
};

/** Alt を併用する単独キーに対するコマンドの割り当て. */
const ALT_KEYS: Record<string, Command> = {
  g: "goto",
  d: "drives",
  b: "addBookmark",
  ArrowLeft: "historyBack",
  ArrowRight: "historyForward",
};

/** プレフィクスキー `C-x` の識別子. */
export const PREFIX_CTRL_X = "C-x";
/** プレフィクスキー `C-c` の識別子. */
export const PREFIX_CTRL_C = "C-c";
/** プレフィクスキー `*` の識別子. */
export const PREFIX_STAR = "*";

/** プレフィクスの後に続くキーに対するコマンドの割り当て. `ctrl` は Ctrl を併用するキー. */
const PREFIX_KEYS: Record<
  string,
  { plain: Record<string, Command>; ctrl: Record<string, Command> }
> = {
  [PREFIX_CTRL_X]: {
    plain: { o: "switchPane", ".": "toggleHidden" },
    ctrl: { f: "touch" },
  },
  [PREFIX_CTRL_C]: {
    plain: { "<": "historyBack", ">": "historyForward" },
    ctrl: {},
  },
  [PREFIX_STAR]: {
    plain: {
      "*": "markAll",
      u: "unmarkAll",
      t: "invertMarks",
      s: "markPattern",
    },
    ctrl: {},
  },
};

/** Ctrl を併用して, プレフィクスになるキー. */
const CTRL_PREFIXES: Record<string, string> = {
  x: PREFIX_CTRL_X,
  c: PREFIX_CTRL_C,
};

/**
 * 割り当て表から, キーに対するコマンドを引きます.
 */
function lookup(
  table: Record<string, Command>,
  key: string,
): Command | undefined {
  return Object.prototype.hasOwnProperty.call(table, key)
    ? table[key]
    : undefined;
}

/**
 * キー入力を, コマンドまたはプレフィクスに解決します.
 *
 * @param event - キー入力の情報 (`key` と修飾キー).
 * @param prefix - 直前に入力されたプレフィクス. 無い場合は null.
 * @returns 解決結果. どれにも当たらない場合は空のオブジェクト.
 */
export function resolveKey(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey"
  >,
  prefix: string | null,
): KeyResolution {
  const { key, ctrlKey, altKey, metaKey } = event;

  if (prefix !== null) {
    const keys = PREFIX_KEYS[prefix];
    const command = ctrlKey
      ? lookup(keys.ctrl, key.toLowerCase())
      : lookup(keys.plain, key);
    return command ? { command } : {};
  }

  if (metaKey || (ctrlKey && altKey)) {
    return {};
  }
  if (ctrlKey) {
    if (Object.prototype.hasOwnProperty.call(CTRL_PREFIXES, key)) {
      return { prefix: CTRL_PREFIXES[key] };
    }
    return { command: lookup(CTRL_KEYS, key) };
  }
  if (altKey) {
    return { command: lookup(ALT_KEYS, key) };
  }

  if (key === PREFIX_STAR) {
    return { prefix: PREFIX_STAR };
  }
  if (key === "Delete" && event.shiftKey) {
    return { command: "deletePermanent" };
  }
  return { command: lookup(PLAIN_KEYS, key) };
}
