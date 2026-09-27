import { describe, it, expect } from "vitest";
import type { FileEntry } from "../features/explorer/types";
import {
  formatAttributes,
  formatDate,
  formatDiskSize,
  formatSize,
} from "../utils/formatters";

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

describe("formatAttributes", () => {
  it.each([
    [{ is_dir: true }, "d-w-"],
    [{}, "-a-w-"],
    [{ readonly: true }, "-a-r-"],
    [{ hidden: true }, "-a-wh"],
  ])("正常系: %j の属性は %s になること", (over, expected) => {
    expect(formatAttributes(entry(over))).toBe(expected);
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
