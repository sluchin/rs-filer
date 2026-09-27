import { describe, it, expect } from "vitest";
import {
  commandNames,
  commonPrefix,
  describeCommandName,
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

describe("resolveCommandName / describeCommandName", () => {
  it.each([
    ["cursorDown", "cursorDown"],
    ["CURSORDOWN", "cursorDown"],
    ["refresh", "reload"],
    ["find", "filter"],
    ["exit", "quit"],
  ])("正常系: %s は %s に解決されること", (name, expected) => {
    expect(resolveCommandName(name)).toBe(expected);
    expect(describeCommandName(name)).not.toBe("");
  });

  it("異常系: 存在しない名前や palette は null になること", () => {
    expect(resolveCommandName("no-such-command")).toBeNull();
    expect(resolveCommandName("palette")).toBeNull();
    expect(describeCommandName("no-such-command")).toBe("");
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
