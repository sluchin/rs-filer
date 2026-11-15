import { describe, it, expect } from "vitest";
import type { FileEntry } from "@/features/explorer/types";
import {
  formatAttributes,
  formatMode,
  formatBytesDetail,
  formatDate,
  formatDiskSize,
  formatSize,
} from "@/utils/formatters";

const entry = (over: Partial<FileEntry>): FileEntry => ({
  name: "n",
  path: "/n",
  is_dir: false,
  size: 0,
  modified: null,
  readonly: false,
  hidden: false,
  ...over,
});

describe("formatDate", () => {
  it("正常系: ローカル時刻の YYYY/MM/DD HH:MM:SS に整形されること", () => {
    const secs = new Date(2011, 11, 7, 2, 33, 34).getTime() / 1000;
    expect(formatDate(secs)).toBe("2011/12/07 02:33:34");
  });

  it.each([null, undefined])("境界: %s は空文字になること", (v) => {
    expect(formatDate(v)).toBe("");
  });
});

describe("formatSize", () => {
  it("正常系: ファイルはバイト数, ディレクトリは空文字になること", () => {
    expect(formatSize(entry({ size: 5206 }))).toBe("5206");
    expect(formatSize(entry({ is_dir: true, size: 4096 }))).toBe("");
  });

  it("境界: サイズが無い場合は 0 になること", () => {
    expect(formatSize({ ...entry({}), size: undefined as never })).toBe("0");
  });
});

describe("formatMode", () => {
  it.each([
    [0o100664, "-rw-rw-r--"],
    [0o040755, "drwxr-xr-x"],
    [0o120777, "lrwxrwxrwx"],
    [0o100000, "----------"],
    [0o020620, "crw--w----"],
    [0o060660, "brw-rw----"],
    [0o010644, "prw-r--r--"],
    [0o140755, "srwxr-xr-x"],
    [0o104755, "-rwsr-xr-x"],
    [0o104644, "-rwSr--r--"],
    [0o102755, "-rwxr-sr-x"],
    [0o102745, "-rwxr-Sr-x"],
    [0o041777, "drwxrwxrwt"],
    [0o041776, "drwxrwxrwT"],
    [0o000644, "?rw-r--r--"],
  ])("正常系: モード %o は %s になること", (mode, expected) => {
    expect(formatMode(mode)).toBe(expected);
  });
});

describe("formatAttributes", () => {
  it.each([
    [{ is_dir: true }, "d-w-"],
    [{}, "-a-w-"],
    [{ readonly: true }, "-a-r-"],
    [{ hidden: true }, "-a-wh"],
  ])("正常系: %j の属性は %s になること", (over, expected) => {
    expect(formatAttributes(entry(over))).toBe(expected);
  });

  it("正常系: パーミッションが分かるときは, ls -l と同じ形になり, 読み取り専用や隠しの印は付かないこと", () => {
    expect(formatAttributes(entry({ mode: 0o100664, hidden: true }))).toBe(
      "-rw-rw-r--",
    );
    expect(
      formatAttributes(entry({ mode: 0o040755, is_dir: true, readonly: true })),
    ).toBe("drwxr-xr-x");
  });
});

describe("formatDiskSize", () => {
  it.each([
    [0, "0B"],
    [512, "512B"],
    [54.44 * 1024 ** 3, "54.44GB"],
    [108.3 * 1024 ** 3, "108.3GB"],
    [3 * 1024 ** 5, "3072TB"],
  ])("正常系: %d バイトは %s になること", (bytes, expected) => {
    expect(formatDiskSize(bytes)).toBe(expected);
  });
});

describe("formatBytesDetail", () => {
  it("正常系: 桁区切りをつけ, 1KB 以上は単位つきの値を添えること", () => {
    expect(formatBytesDetail(0)).toBe("0 バイト");
    expect(formatBytesDetail(1023)).toBe("1,023 バイト");
    expect(formatBytesDetail(1024)).toBe("1,024 バイト (1KB)");
    expect(formatBytesDetail(1234567)).toBe("1,234,567 バイト (1.177MB)");
  });
});
