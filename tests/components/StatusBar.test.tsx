import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StatusBar from "@/components/StatusBar";

const DISK = { free: 100 * 1024 ** 3, total: 1000 * 1024 ** 3 };

/** 既定の値で StatusBar を描画する. */
function renderBar(props: Partial<Parameters<typeof StatusBar>[0]> = {}) {
  return render(
    <StatusBar
      error={null}
      notice={null}
      currentName="docs"
      info="名前 ↑ / マーク: 0"
      disk={DISK}
      {...props}
    />,
  );
}

describe("StatusBar", () => {
  it("正常系: 左にカーソル位置の名前, 中央に状態, 右にディスク容量を表示し, 左と中央に全体のツールチップが付くこと", () => {
    const { container } = renderBar();

    const main = container.querySelector(".status-main");
    expect(main).toHaveTextContent("docs");
    expect(main).toHaveAttribute("title", "docs");
    const info = container.querySelector(".status-info");
    expect(info).toHaveTextContent("名前 ↑ / マーク: 0");
    expect(info).toHaveAttribute("title", "名前 ↑ / マーク: 0");
    expect(container.querySelector(".status-disk")).toHaveTextContent("Free:");
  });

  it("正常系: 通知があれば名前より優先し, エラーがあれば通知より優先して, 全体をツールチップに付けること", () => {
    const { container, rerender } = renderBar({
      notice: "コピーしました: 1 件",
    });
    expect(container.querySelector(".status-main")).toHaveTextContent(
      "コピーしました: 1 件",
    );

    const long = "Failed to read /a/very/long/path: Permission denied";
    rerender(
      <StatusBar
        error={long}
        notice="コピーしました: 1 件"
        currentName="docs"
        info="x"
        disk={DISK}
      />,
    );

    const main = container.querySelector(".status-main");
    expect(main).toHaveClass("status-error");
    expect(main).toHaveTextContent(`エラー: ${long}`);
    expect(main).toHaveAttribute("title", `エラー: ${long}`);
  });

  it("境界: ディスク容量が不明なときは, 容量の表示を出さないこと", () => {
    const { container } = renderBar({ disk: null });

    expect(container.querySelector(".status-disk")).toBeNull();
    expect(container.querySelector(".status-main")).toHaveTextContent("docs");
  });
});
