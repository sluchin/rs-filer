import { describe, expect, it } from "vitest";
import { fileKind } from "@/utils/fileKind";

describe("fileKind", () => {
  it.each([
    ["photo.JPG", "image"],
    ["clip.mp4", "video"],
    ["song.flac", "audio"],
    ["backup.tar.gz", "archive"],
    ["manual.pdf", "pdf"],
    ["report.docx", "document"],
    ["data.csv", "spreadsheet"],
    ["slides.pptx", "presentation"],
    ["main.rs", "code"],
    ["App.tsx", "code"],
    ["build.sh", "script"],
    ["setup.exe", "executable"],
    ["config.json", "config"],
    ["Cargo.lock", "config"],
    [".gitignore", "config"],
    ["notes.md", "text"],
    ["font.woff2", "font"],
  ])("正常系: %s は %s になること", (name, kind) => {
    expect(fileKind(name, false)).toBe(kind);
  });

  it("正常系: 拡張子の無い, 決まった名前のファイルの種類になること (大文字と小文字は区別しない)", () => {
    expect(fileKind("Makefile", false)).toBe("code");
    expect(fileKind("Dockerfile", false)).toBe("config");
    expect(fileKind("README", false)).toBe("text");
    expect(fileKind("LICENSE.txt", false)).toBe("text");
  });

  it("境界: ディレクトリは拡張子があっても dir, 分からないファイルは file になること", () => {
    expect(fileKind("photos.jpg", true)).toBe("dir");
    expect(fileKind("data.xyz", false)).toBe("file");
    expect(fileKind("noext", false)).toBe("file");
    expect(fileKind(".hidden", false)).toBe("file");
    expect(fileKind("trailing.", false)).toBe("file");
  });
});
