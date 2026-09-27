import { describe, it, expect } from "vitest";
import {
  commandNames,
  commonPrefix,
  resolveCommandName,
} from "../features/keybindings/commandNames";

describe("commandNames", () => {
  it("正常系: 名前順に並び, 別名を含み, palette 自身は含まないこと", () => {
    const names = commandNames();
    expect(names).toEqual([...names].sort());
    expect(names).toContain("refresh");
    expect(names).toContain("cursorDown");
    expect(names).not.toContain("palette");
  });
});

describe("resolveCommandName", () => {
  it.each([
    ["cursorDown", "cursorDown"],
    ["CURSORDOWN", "cursorDown"],
    ["refresh", "reload"],
    ["find", "filter"],
    ["exit", "quit"],
  ])("正常系: %s は %s に解決されること", (name, expected) => {
    expect(resolveCommandName(name)).toBe(expected);
  });

  it("異常系: 存在しない名前や palette は null になること", () => {
    expect(resolveCommandName("no-such-command")).toBeNull();
    expect(resolveCommandName("palette")).toBeNull();
  });
});

describe("commonPrefix", () => {
  it.each([
    [["cursorDown", "cursorUp"], "cursor"],
    [["a"], "a"],
    [[], ""],
    [["abc", "xyz"], ""],
  ])("正常系: %j の共通の先頭は %j であること", (values, expected) => {
    expect(commonPrefix(values)).toBe(expected);
  });
});
