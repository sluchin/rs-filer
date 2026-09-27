import { describe, it, expect } from "vitest";
import { PREFIX_CTRL_X, resolveKey } from "../features/keybindings/keymap";

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
    ["k", "cursorUp"],
    ["j", "cursorDown"],
    ["Enter", "open"],
    ["f", "open"],
    ["l", "open"],
    ["Backspace", "parent"],
    ["u", "parent"],
    ["h", "parent"],
    ["^", "parent"],
    ["g", "goto"],
    ["F5", "reload"],
    ["R", "reload"],
    ["Tab", "switchPane"],
    ["N", "mkdir"],
    ["+", "mkdir"],
    ["r", "rename"],
    ["F2", "rename"],
    ["c", "copy"],
    ["d", "delete"],
    ["Delete", "delete"],
    ["D", "deletePermanent"],
    ["x", "openExternal"],
    ["e", "openEditor"],
  ])("正常系: 単独キー %s はコマンド %s になること", (k, command) => {
    expect(resolveKey(key(k), null)).toEqual({ command });
  });

  it("正常系: Shift+Delete は完全削除になること", () => {
    expect(resolveKey(key("Delete", { shiftKey: true }), null)).toEqual({
      command: "deletePermanent",
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
