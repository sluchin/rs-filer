import { describe, it, expect } from "vitest";
import { getBaseName, getParentPath } from "../utils/path";

describe("getParentPath", () => {
  it.each([
    ["/mock", "/"],
    ["/a/b/c", "/a/b"],
    ["C:/Users", "C:/"],
    ["C:\\Users\\foo", "C:/Users"],
    ["rel/sub", "rel"],
  ])("正常系: パス %s の親は %s であること", (current, expectedParent) => {
    expect(getParentPath(current)).toBe(expectedParent);
  });

  it.each(["/", ""])("境界: パス %j は親へ移動できず null を返すこと", (p) => {
    expect(getParentPath(p)).toBeNull();
  });
});

describe("getBaseName", () => {
  it.each([
    ["/a/b/c", "c"],
    ["C:\\Users\\foo", "foo"],
    ["/", ""],
    ["", ""],
  ])("正常系: パス %j の末尾の名前は %j であること", (p, expected) => {
    expect(getBaseName(p)).toBe(expected);
  });
});
