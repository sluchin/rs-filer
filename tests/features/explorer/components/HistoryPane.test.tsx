import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HistoryPane from "@/features/explorer/components/HistoryPane";
import { PATH_LIST_SCROLL_STEP } from "@/features/explorer/pathList";

const LONG = "/home/user/a/very/long/path/that/does/not/fit/in/the/pane";

/** 移動履歴の一覧を描画し, 一覧 (ul) とハンドラーを返す. */
function renderPane(isActive = true, history = ["/a", LONG]) {
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
      history={history}
      historyIndex={history.length - 1}
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

  it("正常系: 見出しは「移動履歴」であること", () => {
    renderPane();
    expect(screen.getByText("移動履歴")).toBeInTheDocument();
  });

  it("正常系: / で絞り込むと, 合う行だけが残り, 選んだときは絞り込む前の履歴上の位置を渡し, 現在地の印は残ること", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPane(true, [
      "/a/docs",
      "/b/music",
      "/c/docs/old",
    ]);

    await user.keyboard("/docs{Enter}");
    expect(screen.queryByText("/b/music")).not.toBeInTheDocument();
    expect(screen.getByText("現在地")).toBeInTheDocument();

    await user.keyboard("j{Enter}");
    expect(handlers.onSelect).toHaveBeenCalledWith("/c/docs/old", 2);
    await user.keyboard("k{Enter}");
    expect(handlers.onSelect).toHaveBeenLastCalledWith("/a/docs", 0);
  });

  it("正常系: 1 件も合わなければその旨が出て, Enter は何も選ばないこと. Esc で絞り込みを解除し, もう一度 Esc で閉じること", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPane(true, ["/a", "/b"]);

    // 入力中の Esc も, 絞り込みを解除するだけで, 一覧は閉じない
    await user.keyboard("/q{Escape}");
    expect(screen.queryByLabelText("left history filter")).toBeNull();
    expect(handlers.onCancel).not.toHaveBeenCalled();

    await user.keyboard("/zzz{Enter}");
    expect(screen.getByText("一致するものがありません.")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(handlers.onSelect).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("left history filter")).toBeNull();
    expect(screen.getByText("/a")).toBeInTheDocument();
    expect(handlers.onCancel).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
  });

  it("正常系: 入力中は j や x を一覧の操作にせず, Enter のあと Ctrl-S や / で入力欄へ戻ること. 入力欄が出ていても / は 1 つのまま", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPane(true, ["/a", "/b"]);

    await user.keyboard("/jx");
    const input = screen.getByLabelText("left history filter");
    expect(input).toHaveValue("jx");
    expect(handlers.onCancel).not.toHaveBeenCalled();

    await user.keyboard("{Enter}{Control>}s{/Control}");
    expect(input).toHaveFocus();
    await user.keyboard("{Enter}/");
    expect(screen.getAllByLabelText("left history filter")).toHaveLength(1);
  });
});
