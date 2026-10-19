import { describe, it, expect } from "vitest";
import { pushHistory } from "../features/explorer/history";

describe("pushHistory", () => {
  it("正常系: 履歴にないディレクトリは, 末尾へ追加し, 現在位置を末尾にすること", () => {
    expect(
      pushHistory({ history: ["/a", "/b"], historyIndex: 1 }, "/c"),
    ).toEqual({
      history: ["/a", "/b", "/c"],
      historyIndex: 2,
    });
  });

  it("正常系: 戻ったあとに移動しても, 進む側の履歴を捨てずに, 末尾へ追加すること", () => {
    expect(
      pushHistory({ history: ["/a", "/b", "/c"], historyIndex: 0 }, "/d"),
    ).toEqual({
      history: ["/a", "/b", "/c", "/d"],
      historyIndex: 3,
    });
  });

  it("正常系: 履歴にあるディレクトリは追加せず, 現在位置をその位置へ合わせること", () => {
    expect(
      pushHistory({ history: ["/a", "/b", "/c"], historyIndex: 2 }, "/a"),
    ).toEqual({
      history: ["/a", "/b", "/c"],
      historyIndex: 0,
    });
  });

  it("境界: 空の履歴には, 最初のディレクトリを追加すること", () => {
    expect(pushHistory({ history: [], historyIndex: -1 }, "/a")).toEqual({
      history: ["/a"],
      historyIndex: 0,
    });
  });
});
