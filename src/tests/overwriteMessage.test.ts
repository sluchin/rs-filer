import { describe, expect, it } from "vitest";
import {
  nestedMessage,
  overwriteMessage,
} from "../features/operations/overwriteMessage";

describe("overwriteMessage", () => {
  it("正常系: 配置先が新しいものが無ければ, 警告なしの文になること", () => {
    expect(overwriteMessage("コピー", ["a", "b"], [])).toBe(
      "2 件が既に存在します (a, b). 上書きしてコピーしますか? (y/n)",
    );
  });

  it("正常系: 配置先が新しいものがあれば, 警告を添え, 4 件以上は省略すること", () => {
    expect(
      overwriteMessage("移動", ["a", "b", "c", "d"], ["a", "b", "c", "d"]),
    ).toBe(
      "4 件が既に存在します (a, b, c ほか). 警告: 4 件 (a, b, c ほか) は, 配置先のほうが更新日時が新しく, 古いもので上書きすることになります. 上書きして移動しますか? (y/n)",
    );
  });
});

describe("nestedMessage", () => {
  it("正常系: 配置先が新しくなければ, 警告なしの文になること", () => {
    expect(nestedMessage("d/a.txt", 1, 2, false)).toBe(
      "「d/a.txt」は既に存在します (1/2). 上書きしますか?",
    );
  });

  it("正常系: 配置先が新しければ, 警告を添えること", () => {
    expect(nestedMessage("d/a.txt", 2, 2, true)).toBe(
      "「d/a.txt」は既に存在します (2/2). 警告: 配置先のほうが更新日時が新しく, 古いもので上書きすることになります. 上書きしますか?",
    );
  });
});
