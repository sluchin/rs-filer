import { COMMANDS, type Command, type KeyResolution } from "./types";

/**
 * キーの並び (`"C-x C-f"` など) から, コマンドへの対応.
 */
export type Keymap = Map<string, Command>;

/**
 * キーの並びの表記の規則:
 * - キーは空白で区切って並べる (`C-x C-f`).
 * - 修飾キーは `C-` (Ctrl), `M-` (Alt), `S-` (Shift) をキーの前に付ける. Shift は, 名前のあるキー (`S-Delete`) だけに使う.
 * - 文字はそのまま書く (`k`, `N`, `+`). 名前のあるキーは, `Enter` `Tab` `Space` `Backspace` `Delete` `Escape`
 *   `Up` `Down` `Left` `Right` `Home` `End` `PageUp` `PageDown` `F1`〜`F12`.
 */
export const DEFAULT_BINDINGS: Record<string, Command> = {
  Up: "cursorUp",
  "C-p": "cursorUp",
  k: "cursorUp",
  Down: "cursorDown",
  "C-n": "cursorDown",
  j: "cursorDown",
  PageUp: "pageUp",
  "M-v": "pageUp",
  PageDown: "pageDown",
  "C-v": "pageDown",
  Home: "cursorFirst",
  "M-<": "cursorFirst",
  End: "cursorLast",
  "M->": "cursorLast",
  Enter: "open",
  f: "open",
  l: "open",
  Right: "open",
  x: "openExternal",
  e: "openEditor",
  Backspace: "parent",
  h: "parent",
  "^": "parent",
  Left: "parent",
  g: "goto",
  "M-g": "goto",
  "M-d": "drives",
  F5: "reload",
  R: "reload",
  "C-l": "reload",
  Tab: "switchPane",
  "C-i": "switchPane",
  "C-x o": "switchPane",
  N: "mkdir",
  "+": "mkdir",
  "C-x C-f": "touch",
  F2: "rename",
  r: "rename",
  c: "copy",
  C: "copyConfirm",
  m: "move",
  M: "moveConfirm",
  O: "syncPane",
  "C-x 4": "syncPane",
  v: "preview",
  H: "log",
  Delete: "delete",
  d: "delete",
  D: "deletePermanent",
  "S-Delete": "deletePermanent",
  Space: "mark",
  u: "unmark",
  U: "unmarkAll",
  "C-a": "markAll",
  "* *": "markAll",
  "* u": "unmarkAll",
  "* t": "invertMarks",
  "* s": "markPattern",
  ".": "toggleHidden",
  "C-x .": "toggleHidden",
  s: "cycleSort",
  i: "toggleDetails",
  "/": "filter",
  "C-s": "filter",
  Escape: "cancel",
  "C-g": "cancel",
  "M-Left": "historyBack",
  "C-c <": "historyBack",
  "M-Right": "historyForward",
  "C-c >": "historyForward",
  b: "bookmarks",
  "M-b": "addBookmark",
  "M-x": "palette",
  ":": "palette",
  "?": "help",
  q: "quit",
  "C-x C-c": "quit",
};

/** キーイベントの `key` から, 表記のキー名への対応. */
const KEY_NAMES: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  " ": "Space",
};

/** 名前のあるキー. */
const NAMED_KEYS = new Set([
  "Enter",
  "Tab",
  "Space",
  "Backspace",
  "Delete",
  "Escape",
  "Up",
  "Down",
  "Left",
  "Right",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]);

/** 修飾キーを, 表記の順 (`C-` `M-` `S-`) に並べたときの並び順. */
const MODIFIER_ORDER = ["C", "M", "S"];

/**
 * キー 1 つの表記を検証し, 修飾キーを決まった順に並べた形にします.
 *
 * @param token - キー 1 つの表記 (`C-x`, `Delete` など).
 * @returns 正規化した表記. 不正な場合は null.
 */
function normalizeToken(token: string): string | null {
  const match = /^((?:[CMS]-)*)(.+)$/.exec(token);
  if (!match) {
    return null;
  }
  const modifiers = match[1].split("-").filter(Boolean);
  const key = match[2];
  const named = NAMED_KEYS.has(key);
  if (!named && [...key].length !== 1) {
    return null;
  }
  if (new Set(modifiers).size !== modifiers.length) {
    return null;
  }
  if (modifiers.includes("S") && !named) {
    return null;
  }
  const ordered = MODIFIER_ORDER.filter((m) => modifiers.includes(m));
  return [...ordered.map((m) => `${m}-`), key].join("");
}

/**
 * キーの並びの表記を検証し, 正規化します.
 *
 * @param spec - キーの並び (`"C-x C-f"` など).
 * @returns 正規化した表記. 不正な場合は null.
 */
export function normalizeSpec(spec: string): string | null {
  const tokens = spec.trim().split(/\s+/);
  const normalized = tokens.map(normalizeToken);
  return normalized.every((t) => t !== null) && spec.trim() !== ""
    ? normalized.join(" ")
    : null;
}

/**
 * ユーザーの設定を重ねて, キーマップを作ります.
 *
 * 設定は, キーの並びからコマンド名への対応です. 値が null の場合は, そのキーの割り当てを解除します.
 * 不正なキーの表記や, 存在しないコマンド名は無視して, 警告として返します.
 *
 * @param overrides - ユーザーの設定. 省略した場合は既定のままにする.
 * @returns キーマップと, 無視した設定についての警告.
 */
export function buildKeymap(overrides: Record<string, string | null> = {}): {
  keymap: Keymap;
  warnings: string[];
} {
  const keymap: Keymap = new Map();
  for (const [spec, command] of Object.entries(DEFAULT_BINDINGS)) {
    keymap.set(spec, command);
  }
  const warnings: string[] = [];
  for (const [spec, command] of Object.entries(overrides)) {
    const normalized = normalizeSpec(spec);
    if (normalized === null) {
      warnings.push(`キーの表記が不正です: ${spec}`);
    } else if (command === null) {
      keymap.delete(normalized);
    } else if ((COMMANDS as readonly string[]).includes(command)) {
      keymap.set(normalized, command as Command);
    } else {
      warnings.push(`コマンドが存在しません: ${command} (${spec})`);
    }
  }
  return { keymap, warnings };
}

/** 既定のキーマップ. */
export const DEFAULT_KEYMAP: Keymap = buildKeymap().keymap;

/**
 * キーイベントを, キー 1 つの表記にします.
 *
 * @param event - キー入力の情報 (`key` と修飾キー).
 * @returns 表記. 修飾キー単独や, Meta との併用など, 表記できない場合は null.
 */
export function eventToToken(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey"
  >,
): string | null {
  if (event.metaKey) {
    return null;
  }
  const name = KEY_NAMES[event.key] ?? event.key;
  const named = NAMED_KEYS.has(name);
  if (!named && [...name].length !== 1) {
    return null;
  }
  const key = event.ctrlKey && !named ? name.toLowerCase() : name;
  return [
    event.ctrlKey ? "C-" : "",
    event.altKey ? "M-" : "",
    event.shiftKey && named ? "S-" : "",
    key,
  ].join("");
}

/**
 * キー入力を, コマンドまたはプレフィクスに解決します.
 *
 * @param event - キー入力の情報 (`key` と修飾キー).
 * @param prefix - 直前までに入力された, 途中のキーの並び (`C-x` など). 無い場合は null.
 * @param keymap - 使うキーマップ. 省略した場合は既定のキーマップ.
 * @returns 解決結果. コマンドが決まった場合は `command`, 続きのキーを待つ場合は `prefix`,
 *   どれにも当たらない場合は空のオブジェクト.
 */
export function resolveKey(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey"
  >,
  prefix: string | null,
  keymap: Keymap = DEFAULT_KEYMAP,
): KeyResolution {
  const token = eventToToken(event);
  if (token === null) {
    return {};
  }
  const sequence = prefix === null ? token : `${prefix} ${token}`;
  const command = keymap.get(sequence);
  if (command !== undefined) {
    return { command };
  }
  const continues = [...keymap.keys()].some((k) =>
    k.startsWith(`${sequence} `),
  );
  return continues ? { prefix: sequence } : {};
}

/** プレフィクスキー `C-x` の識別子. */
export const PREFIX_CTRL_X = "C-x";
/** プレフィクスキー `C-c` の識別子. */
export const PREFIX_CTRL_C = "C-c";
/** プレフィクスキー `*` の識別子. */
export const PREFIX_STAR = "*";

/**
 * キーマップを, コマンドから, それに割り当てられているキーの並びの一覧への対応にします.
 *
 * @param keymap - 対象のキーマップ.
 * @returns コマンドごとの, キーの並び (登録順).
 */
export function reverseKeymap(
  keymap: Keymap,
): Partial<Record<Command, string[]>> {
  const result: Partial<Record<Command, string[]>> = {};
  for (const [spec, command] of keymap) {
    (result[command] ??= []).push(spec);
  }
  return result;
}
