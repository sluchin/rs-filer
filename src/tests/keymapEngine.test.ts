import { describe, it, expect } from "vitest";
import {
  buildKeymap,
  DEFAULT_BINDINGS,
  DEFAULT_KEYMAP,
  eventToToken,
  normalizeSpec,
  resolveKey,
  reverseKeymap,
} from "../features/keybindings/keymap";

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
    expect(reversed.help).toEqual(["?"]);
  });

  it("境界: 何も割り当てられていないコマンドは含まれないこと", () => {
    const reversed = reverseKeymap(new Map());
    expect(reversed.cursorDown).toBeUndefined();
  });
});
