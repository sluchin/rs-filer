import { describe, it, expect, vi, beforeEach } from "vitest";
import { copyChoicesOf, copyTextOf } from "@/features/explorer/copyText";

const file = { path: "/home/user/a.txt", name: "a.txt", isDir: false };
const dir = { path: "/home/user/docs", name: "docs", isDir: true };

describe("copyTextOf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: fullPath はフルパス, name は名前を返すこと", () => {
    expect(copyTextOf(file, "fullPath")).toBe("/home/user/a.txt");
    expect(copyTextOf(file, "name")).toBe("a.txt");
    expect(copyTextOf(dir, "name")).toBe("docs");
  });

  it("正常系: Windows のパスも, そのまま返すこと", () => {
    const unc = {
      path: "\\\\server\\share\\b.txt",
      name: "b.txt",
      isDir: false,
    };
    expect(copyTextOf(unc, "fullPath")).toBe("\\\\server\\share\\b.txt");
  });
});

describe("copyChoicesOf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: ファイルなら「ファイル名をコピー」を出すこと", () => {
    expect(copyChoicesOf(file)).toEqual([
      { kind: "fullPath", label: "フルパスをコピー" },
      { kind: "name", label: "ファイル名をコピー" },
    ]);
  });

  it("正常系: ディレクトリなら「ディレクトリ名をコピー」を出すこと", () => {
    expect(copyChoicesOf(dir)[1]).toEqual({
      kind: "name",
      label: "ディレクトリ名をコピー",
    });
  });
});
