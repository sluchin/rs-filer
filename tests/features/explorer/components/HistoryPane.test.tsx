import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HistoryPane from "@/features/explorer/components/HistoryPane";
import { PATH_LIST_SCROLL_STEP } from "@/features/explorer/pathList";

const LONG = "/home/user/a/very/long/path/that/does/not/fit/in/the/pane";

/** 履歴一覧を描画し, 一覧 (ul) とハンドラーを返す. */
function renderPane(isActive = true) {
  const handlers = {
    onActivate: vi.fn(),
    onSelect: vi.fn(),
    onCancel: vi.fn(),
    onSwitchPane: vi.fn(),
    // 一覧を開くキーの判定は App がキーマップで行う. ここでは x を, 開くキーとみなす
    isToggleKey: vi.fn((e: KeyboardEvent) => e.key === "x"),
  };
  render(
    <HistoryPane
      paneId="left"
      isActive={isActive}
      history={["/a", LONG]}
      historyIndex={1}
      {...handlers}
    />,
  );
  return { list: screen.getByRole("list"), handlers };
}

describe("HistoryPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: パスを省略せずに表示し, 一覧を横にスクロールできるクラスを付けること", () => {
    const { list } = renderPane();

    expect(list).toHaveClass("file-rows", "path-rows");
    const path = screen.getByText(LONG);
    expect(path).toHaveClass("full-path");
  });

  it("正常系: → と ← で, 一覧を横にスクロールすること", async () => {
    const user = userEvent.setup();
    const { list } = renderPane();

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(list.scrollLeft).toBe(PATH_LIST_SCROLL_STEP * 2);

    await user.keyboard("{ArrowLeft}");
    expect(list.scrollLeft).toBe(PATH_LIST_SCROLL_STEP);
  });

  it("正常系: アクティブでないときは, ← → でスクロールしないこと", async () => {
    const user = userEvent.setup();
    const { list } = renderPane(false);

    await user.keyboard("{ArrowRight}");
    expect(list.scrollLeft).toBe(0);
  });

  it("正常系: 一覧を開くキーをもう一度押すと, 閉じること (トグル)", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPane();

    await user.keyboard("x");

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });
});
