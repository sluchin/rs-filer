import { describe, it, expect } from "vitest";
import { getBaseName, getParentPath } from "../utils/path";

describe("getParentPath", () => {
  it.each([
    ["/mock", "/"],
    ["/a/b/c", "/a/b"],
    ["C:/Users", "C:/"],
    ["C:\\Users\\foo", "C:/Users"],
    ["rel/sub", "rel"],
    ["\\\\server\\share\\folder", "//server/share"],
    ["//server/share/a/b", "//server/share/a"],
  ])("正常系: パス %s の親は %s であること", (current, expectedParent) => {
    expect(getParentPath(current)).toBe(expectedParent);
  });

  it.each(["/", "", "C:/", "C:\\", "\\\\server\\share", "//server/share"])(
    "境界: パス %j は親へ移動できず null を返すこと (ルート・ドライブ直下・UNC の共有直下)",
    (p) => {
      expect(getParentPath(p)).toBeNull();
    },
  );
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
