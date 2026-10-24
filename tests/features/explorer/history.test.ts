import { describe, it, expect } from "vitest";
import { pushHistory } from "@/features/explorer/history";

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

  it("正常系: 履歴にあるディレクトリは, 古い位置から除いて末尾へ移し, 現在位置を末尾にすること", () => {
    expect(
      pushHistory({ history: ["/a", "/b", "/c"], historyIndex: 2 }, "/a"),
    ).toEqual({
      history: ["/b", "/c", "/a"],
      historyIndex: 2,
    });
  });

  it("正常系: 末尾のディレクトリをもう一度開いたら, 同じ配列を返し, 現在位置を末尾にすること", () => {
    const history = ["/a", "/b"];
    const next = pushHistory({ history, historyIndex: 0 }, "/b");
    expect(next.history).toBe(history);
    expect(next.historyIndex).toBe(1);
  });

  it("境界: 追加して上限を超えたら, 古い方から捨てること", () => {
    expect(
      pushHistory({ history: ["/a", "/b"], historyIndex: 0 }, "/c", 2),
    ).toEqual({
      history: ["/b", "/c"],
      historyIndex: 1,
    });
  });

  it("境界: 上限ちょうどまでは捨てず, 履歴にあるディレクトリを末尾へ移しても, 件数は増えないこと", () => {
    expect(
      pushHistory({ history: ["/a"], historyIndex: 0 }, "/b", 2).history,
    ).toEqual(["/a", "/b"]);
    expect(
      pushHistory({ history: ["/a", "/b"], historyIndex: 1 }, "/a", 2),
    ).toEqual({ history: ["/b", "/a"], historyIndex: 1 });
  });

  it("境界: 上限が 1 より小さければ, 今のディレクトリの 1 件だけを残すこと", () => {
    expect(pushHistory({ history: ["/a"], historyIndex: 0 }, "/b", 0)).toEqual({
      history: ["/b"],
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
