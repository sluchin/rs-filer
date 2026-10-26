import { describe, it, expect } from "vitest";
import {
  buildKeymap,
  DEFAULT_BINDINGS,
  DEFAULT_KEYMAP,
  eventToToken,
  normalizeSpec,
  PREFIX_CTRL_X,
  PREFIX_PERCENT,
  PREFIX_STAR,
  resolveKey,
  reverseKeymap,
} from "@/features/keybindings/keymap";

/** 修飾キーなしのキー入力を作るヘルパー. */
const key = (
  k: string,
  mods: Partial<
    Record<"ctrlKey" | "altKey" | "metaKey" | "shiftKey", boolean>
  > = {},
) => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("resolveKey", () => {
  it.each([
    ["ArrowUp", "cursorUp"],
    ["p", "cursorUp"],
    ["k", "cursorUp"],
    ["n", "cursorDown"],
    ["j", "cursorDown"],
    ["Enter", "open"],
    ["f", "open"],
    ["l", "open"],
    ["Backspace", "parent"],
    ["h", "help"],
    ["^", "parent"],
    ["g", "reload"],
    ["F5", "reload"],
    ["R", "move"],
    ["Tab", "switchPane"],
    ["N", "mkdir"],
    ["+", "mkdir"],
    ["r", "rename"],
    ["F2", "rename"],
    ["c", "copy"],
    ["C", "copyConfirm"],
    ["d", "flagDeletion"],
    ["Delete", "delete"],
    ["D", "delete"],
    ["x", "deleteFlagged"],
    ["e", "openEditor"],
    ["m", "mark"],
    ["M", "moveConfirm"],
    ["O", "syncPane"],
    ["v", "preview"],
    ["L", "log"],
    ["H", "gotoHome"],
    [" ", "cursorDown"],
    ["u", "unmark"],
    ["U", "unmarkAll"],
    ["t", "invertMarks"],
    ["T", "toggleTree"],
    ["w", "copyName"],
    ["W", "openExternal"],
    ["(", "toggleDetails"],
    [".", "toggleHidden"],
    ["s", "cycleSort"],
    ["i", "toggleDetails"],
    ["/", "filter"],
    ["b", "bookmarks"],
    ["Escape", "cancel"],
  ])("正常系: 単独キー %s はコマンド %s になること", (k, command) => {
    expect(resolveKey(key(k), null)).toEqual({ command });
  });

  it("正常系: Shift+Delete は完全削除になること", () => {
    expect(resolveKey(key("Delete", { shiftKey: true }), null)).toEqual({
      command: "deletePermanent",
    });
  });

  it("正常系: Ctrl+A / Ctrl+S / Alt+B / Alt+矢印がコマンドになること", () => {
    expect(resolveKey(key("a", { ctrlKey: true }), null)).toEqual({
      command: "markAll",
    });
    expect(resolveKey(key("s", { ctrlKey: true }), null)).toEqual({
      command: "filter",
    });
    expect(resolveKey(key("b", { altKey: true }), null)).toEqual({
      command: "addBookmark",
    });
    expect(resolveKey(key("ArrowLeft", { altKey: true }), null)).toEqual({
      command: "historyBack",
    });
    expect(resolveKey(key("ArrowRight", { altKey: true }), null)).toEqual({
      command: "historyForward",
    });
  });

  it("正常系: * の後のキーで, Dired と同じマーク操作になること", () => {
    expect(resolveKey(key("*"), null)).toEqual({ prefix: PREFIX_STAR });
    for (const [k, command] of [
      ["*", "markAll"],
      ["s", "markAll"],
      ["m", "mark"],
      ["u", "unmark"],
      ["!", "unmarkAll"],
      ["?", "unmarkAll"],
      ["t", "invertMarks"],
      ["%", "markPattern"],
    ] as const) {
      expect(resolveKey(key(k), PREFIX_STAR)).toEqual({ command });
    }
  });

  it("正常系: 0 の後に w でフルパスのコピー, ! で外部コマンドになること (Dired と同じ)", () => {
    expect(resolveKey(key("0"), null)).toEqual({ prefix: "0" });
    expect(resolveKey(key("w"), "0")).toEqual({ command: "copyFullPath" });
    expect(resolveKey(key("!"), null)).toEqual({
      command: "externalCommand",
    });
    expect(resolveKey(key("!", { altKey: true }), null)).toEqual({
      command: "openTerminal",
    });
  });

  it("正常系: % の後に m でパターンマークになること", () => {
    expect(resolveKey(key("%"), null)).toEqual({ prefix: PREFIX_PERCENT });
    expect(resolveKey(key("m"), PREFIX_PERCENT)).toEqual({
      command: "markPattern",
    });
  });

  it("正常系: C-c でクリップボードコピー, M-Left/Right で履歴移動, C-x の後に . で隠しファイルの切り替えになること", () => {
    expect(resolveKey(key("c", { ctrlKey: true }), null)).toEqual({
      command: "copyToClipboard",
    });
    expect(resolveKey(key("ArrowLeft", { altKey: true }), null)).toEqual({
      command: "historyBack",
    });
    expect(resolveKey(key("ArrowRight", { altKey: true }), null)).toEqual({
      command: "historyForward",
    });
    expect(resolveKey(key("."), PREFIX_CTRL_X)).toEqual({
      command: "toggleHidden",
    });
    expect(resolveKey(key("4"), PREFIX_CTRL_X)).toEqual({
      command: "syncPane",
    });
  });

  it("正常系: Ctrl+L と Alt+G と Alt+D がコマンドになること", () => {
    expect(resolveKey(key("l", { ctrlKey: true }), null)).toEqual({
      command: "reload",
    });
    expect(resolveKey(key("g", { altKey: true }), null)).toEqual({
      command: "goto",
    });
    expect(resolveKey(key("d", { altKey: true }), null)).toEqual({
      command: "drives",
    });
  });

  it("正常系: C-x の後に C-f で新規ファイル, o でペイン切り替えになること", () => {
    expect(resolveKey(key("x", { ctrlKey: true }), null)).toEqual({
      prefix: PREFIX_CTRL_X,
    });
    expect(resolveKey(key("f", { ctrlKey: true }), PREFIX_CTRL_X)).toEqual({
      command: "touch",
    });
    expect(resolveKey(key("o"), PREFIX_CTRL_X)).toEqual({
      command: "switchPane",
    });
  });

  it("異常系: C-x の後に割り当ての無いキーを押すとコマンドにならないこと", () => {
    expect(resolveKey(key("z"), PREFIX_CTRL_X)).toEqual({});
    expect(resolveKey(key("z", { ctrlKey: true }), PREFIX_CTRL_X)).toEqual({});
  });

  it("境界: 割り当ての無い修飾キー付きの入力はコマンドにならないこと", () => {
    expect(resolveKey(key("k", { metaKey: true }), null)).toEqual({});
    expect(resolveKey(key("k", { ctrlKey: true }), null)).toEqual({});
    expect(resolveKey(key("k", { altKey: true }), null)).toEqual({});
    expect(resolveKey(key("k", { ctrlKey: true, altKey: true }), null)).toEqual(
      {},
    );
  });

  it("境界: 割り当ての無い単独キーはコマンドにならないこと", () => {
    expect(resolveKey(key("z"), null).command).toBeUndefined();
  });
});

describe("eventToToken", () => {
  it.each([
    [key("k"), "k"],
    [key("N"), "N"],
    [key("k", { ctrlKey: true }), "C-k"],
    [key("k", { altKey: true }), "M-k"],
    [key("k", { ctrlKey: true, altKey: true }), "C-M-k"],
    [key("ArrowUp"), "Up"],
    [key("ArrowDown", { altKey: true }), "M-Down"],
    [key(" "), "Space"],
    [key("Delete", { shiftKey: true }), "S-Delete"],
    [key("k", { shiftKey: true }), "k"],
  ])("正常系: イベントがトークン %j になること", (event, expected) => {
    expect(eventToToken(event)).toBe(expected);
  });

  it("境界: Meta キーとの併用はトークンにならないこと", () => {
    expect(eventToToken(key("k", { metaKey: true }))).toBeNull();
  });
});

describe("normalizeSpec", () => {
  it.each([
    ["C-x C-f", "C-x C-f"],
    ["M-C-a", "C-M-a"],
    [" k ", "k"],
    ["S-Delete", "S-Delete"],
  ])("正常系: %s は %s に正規化されること", (spec, expected) => {
    expect(normalizeSpec(spec)).toBe(expected);
  });

  it.each(["", "  ", "ab", "S-k", "C-C-a", "X-k", "c-x"])(
    "異常系: %j は不正な表記であること",
    (spec) => {
      expect(normalizeSpec(spec)).toBeNull();
    },
  );
});

describe("buildKeymap", () => {
  it("正常系: 上書きが無ければ既定のキーマップと同じであること", () => {
    const { keymap, warnings } = buildKeymap();
    expect(keymap.get("j")).toBe("cursorDown");
    expect(keymap.size).toBe(Object.keys(DEFAULT_BINDINGS).length);
    expect(warnings).toEqual([]);
  });

  it("正常系: 上書きで割り当ての変更・解除ができること", () => {
    const { keymap, warnings } = buildKeymap({
      "C-j": "cursorDown",
      k: null,
    });
    expect(keymap.get("C-j")).toBe("cursorDown");
    expect(keymap.has("k")).toBe(false);
    expect(warnings).toEqual([]);
  });

  it("異常系: 不正なキーの表記や存在しないコマンド名は警告になり, 反映されないこと", () => {
    const { keymap, warnings } = buildKeymap({
      "X-k": "cursorDown",
      j: "noSuchCommand",
    });
    expect(keymap.get("j")).toBe("cursorDown");
    expect(warnings).toEqual([
      "キーの表記が不正です: X-k",
      "コマンドが存在しません: noSuchCommand (j)",
    ]);
  });
});

describe("resolveKey (エンジン)", () => {
  it("正常系: キーマップを明示的に渡せること", () => {
    const { keymap } = buildKeymap({ z: "quit" });
    expect(resolveKey(key("z"), null, keymap)).toEqual({ command: "quit" });
    expect(resolveKey(key("z"), null, DEFAULT_KEYMAP)).toEqual({});
  });

  it("正常系: 途中まで一致する場合はプレフィクスとして継続すること", () => {
    expect(resolveKey(key("x", { ctrlKey: true }), null)).toEqual({
      prefix: "C-x",
    });
  });

  it("正常系: 直接一致するキーは, 続きがあってもコマンドとして解決されること", () => {
    expect(resolveKey(key("g", { ctrlKey: true }), null)).toEqual({
      command: "cancel",
    });
  });
});

describe("reverseKeymap", () => {
  it("正常系: コマンドごとに, 割り当てられているキーの並びをまとめること", () => {
    const { keymap } = buildKeymap();
    const reversed = reverseKeymap(keymap);
    expect(reversed.cursorDown).toEqual(
      expect.arrayContaining(["Down", "C-n", "j"]),
    );
    expect(reversed.help).toEqual(["?", "h"]);
  });

  it("境界: 何も割り当てられていないコマンドは含まれないこと", () => {
    const reversed = reverseKeymap(new Map());
    expect(reversed.cursorDown).toBeUndefined();
  });
});
