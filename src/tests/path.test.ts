import { describe, it, expect } from "vitest";
import {
  getBaseName,
  getParentPath,
  isSamePath,
  toNativePath,
  uniqueNativePaths,
} from "../utils/path";

describe("getParentPath", () => {
  it.each([
    ["/mock", "/"],
    ["/a/b/c", "/a/b"],
    ["C:/Users", "C:\\"],
    ["C:\\Users\\foo", "C:\\Users"],
    ["C:/Users/foo", "C:\\Users"],
    ["rel/sub", "rel"],
    ["\\\\server\\share\\folder", "\\\\server\\share"],
    ["//server/share/a/b", "\\\\server\\share\\a"],
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

describe("isSamePath", () => {
  it.each([
    ["/a/b", "/a/b"],
    ["/a/b/", "/a/b"],
    ["C:/Users/foo", "C:\\Users\\foo"],
    ["c:\\users\\FOO\\", "C:\\Users\\foo"],
    ["C:", "C:\\"],
    ["\\\\server\\share\\a", "//SERVER/share/a"],
    ["/", "/"],
  ])("正常系: パス %j と %j は同じ場所であること", (a, b) => {
    expect(isSamePath(a, b)).toBe(true);
  });

  it.each([
    ["/a/b", "/a/c"],
    ["/a/B", "/a/b"],
    ["C:/a", "D:/a"],
  ])("異常系: パス %j と %j は違う場所であること", (a, b) => {
    expect(isSamePath(a, b)).toBe(false);
  });
});

describe("toNativePath", () => {
  it.each([
    ["C:/Users\\foo", "C:\\Users\\foo"],
    ["C:/", "C:\\"],
    ["//server/share/a", "\\\\server\\share\\a"],
    ["\\\\server\\share", "\\\\server\\share"],
    ["/home/user", "/home/user"],
    ["/", "/"],
  ])("正常系: パス %j は %j になること", (p, expected) => {
    expect(toNativePath(p)).toBe(expected);
  });
});

describe("uniqueNativePaths", () => {
  it("正常系: 区切りをそろえて, 重複を除き, 最初に出てきた順に並べること", () => {
    expect(
      uniqueNativePaths([
        "C:\\Users\\foo",
        "/home",
        "C:/Users\\foo",
        "C:/Users",
        "/home",
      ]),
    ).toEqual(["C:\\Users\\foo", "/home", "C:\\Users"]);
  });
});
