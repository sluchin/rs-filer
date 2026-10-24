import { describe, expect, it } from "vitest";
import {
  PATH_LIST_SCROLL_STEP,
  scrollPathList,
} from "@/features/explorer/pathList";

describe("scrollPathList", () => {
  it("正常系: → で右へ, ← で左へ, 一覧を横にスクロールし, true を返すこと", () => {
    const list = document.createElement("ul");

    expect(scrollPathList(list, "ArrowRight")).toBe(true);
    expect(list.scrollLeft).toBe(PATH_LIST_SCROLL_STEP);
    expect(scrollPathList(list, "ArrowLeft")).toBe(true);
    expect(list.scrollLeft).toBe(0);
  });

  it("正常系: ← → 以外のキーでは, スクロールせずに false を返すこと", () => {
    const list = document.createElement("ul");

    expect(scrollPathList(list, "j")).toBe(false);
    expect(list.scrollLeft).toBe(0);
  });
});
