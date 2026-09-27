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
  u: "parent",
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
};

/** `C-x` プレフィクスの後に続くキー (Ctrl 併用) の割り当て. */
const CTRL_X_CTRL_KEYS: Record<string, Command> = {
  f: "touch",
};

/** `C-x` プレフィクスの後に続く単独キーの割り当て. */
const CTRL_X_PLAIN_KEYS: Record<string, Command> = {
  o: "switchPane",
};

/** プレフィクスキー `C-x` の識別子. */
export const PREFIX_CTRL_X = "C-x";

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

  if (prefix === PREFIX_CTRL_X) {
    const command = ctrlKey
      ? CTRL_X_CTRL_KEYS[key.toLowerCase()]
      : CTRL_X_PLAIN_KEYS[key];
    return command ? { command } : {};
  }

  if (metaKey) {
    return {};
  }
  if (ctrlKey && !altKey) {
    if (key === "x") {
      return { prefix: PREFIX_CTRL_X };
    }
    return key === "l" ? { command: "reload" } : {};
  }
  if (altKey && !ctrlKey) {
    if (key === "g") {
      return { command: "goto" };
    }
    return key === "d" ? { command: "drives" } : {};
  }
  if (ctrlKey || altKey) {
    return {};
  }

  if (key === "Delete" && event.shiftKey) {
    return { command: "deletePermanent" };
  }
  return { command: PLAIN_KEYS[key] };
}
