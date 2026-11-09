import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BookmarkPane from "@/features/bookmarks/components/BookmarkPane";
import { PATH_LIST_SCROLL_STEP } from "@/features/explorer/pathList";

const LONG = "/home/user/a/very/long/path/that/does/not/fit/in/the/pane";

/** ブックマーク一覧を描画し, 一覧 (ul) とハンドラーを返す. */
function renderPane(isActive = true) {
  const handlers = {
    onActivate: vi.fn(),
    onSelect: vi.fn(),
    onRemove: vi.fn(),
    onCancel: vi.fn(),
    onSwitchPane: vi.fn(),
    // 一覧を開くキーの判定は App がキーマップで行う. ここでは x を, 開くキーとみなす
    isToggleKey: vi.fn((e: KeyboardEvent) => e.key === "x"),
  };
  render(
    <BookmarkPane
      paneId="left"
      isActive={isActive}
      bookmarks={["/a", LONG]}
      {...handlers}
    />,
  );
  return { list: screen.getByRole("list"), handlers };
}

describe("BookmarkPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: パスを省略せずに表示し, 一覧を横にスクロールできるクラスを付けること", () => {
    const { list } = renderPane();

    expect(list).toHaveClass("file-rows", "path-rows");
    expect(screen.getByText(LONG)).toHaveClass("full-path");
  });

  it("正常系: → と ← で, 一覧を横にスクロールし, カーソルや選択は変わらないこと", async () => {
    const user = userEvent.setup();
    const { list, handlers } = renderPane();

    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowLeft}");

    expect(list.scrollLeft).toBe(PATH_LIST_SCROLL_STEP);
    expect(screen.getByText("/a").closest("li")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(handlers.onSelect).not.toHaveBeenCalled();
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

  it("正常系: onReveal を渡すと, o でカーソル位置のパスを渡すこと. 空の一覧では呼ばないこと", async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn();
    const props = {
      paneId: "left" as const,
      isActive: true,
      onActivate: vi.fn(),
      onSelect: vi.fn(),
      onRemove: vi.fn(),
      onCancel: vi.fn(),
      onSwitchPane: vi.fn(),
      isToggleKey: () => false,
      onReveal,
    };
    const { rerender } = render(
      <BookmarkPane {...props} bookmarks={["/a", "/b"]} />,
    );

    await user.keyboard("jo");
    expect(onReveal).toHaveBeenCalledWith("/b");

    onReveal.mockClear();
    rerender(<BookmarkPane {...props} bookmarks={[]} />);
    await user.keyboard("o");
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("境界: onReveal が無ければ, o は何もしないこと", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPane();

    await user.keyboard("o");

    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it("正常系: onContextMenu を渡すと, 右クリックした行にカーソルを移し, パスと座標を渡すこと", () => {
    const onContextMenu = vi.fn();
    render(
      <BookmarkPane
        paneId="left"
        isActive
        onActivate={vi.fn()}
        bookmarks={["/a", "/b"]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onCancel={vi.fn()}
        onSwitchPane={vi.fn()}
        isToggleKey={() => false}
        onContextMenu={onContextMenu}
      />,
    );

    fireEvent.contextMenu(screen.getByText("/b"), { clientX: 12, clientY: 34 });

    expect(onContextMenu).toHaveBeenCalledWith("/b", 12, 34);
    expect(screen.getByText("/b").closest("li")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("境界: onContextMenu が無ければ, 右クリックしても何もしないこと (既定のメニューも止めない)", () => {
    renderPane();

    const notPrevented = fireEvent.contextMenu(screen.getByText("/a"));

    expect(notPrevented).toBe(true);
  });
});
