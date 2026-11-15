import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BookmarkPane from "@/features/bookmarks/components/BookmarkPane";
import { PATH_LIST_SCROLL_STEP } from "@/features/explorer/pathList";

const LONG = "/home/user/a/very/long/path/that/does/not/fit/in/the/pane";

/** ブックマーク一覧を描画し, 一覧 (ul) とハンドラーを返す. */
function renderPane(isActive = true, bookmarks = ["/a", LONG]) {
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
      bookmarks={bookmarks}
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

  it("正常系: ほかの一覧を開くキーは onOtherListKey に渡り, 処理されたら何もせず, 処理されなければ通常どおり扱うこと", async () => {
    const user = userEvent.setup();
    const onOtherListKey = vi.fn((e: KeyboardEvent) => e.key === "F");
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
        onOtherListKey={onOtherListKey}
      />,
    );

    await user.keyboard("F");
    await user.keyboard("j");

    expect(onOtherListKey).toHaveBeenCalledTimes(2);
    expect(screen.getByText("/b").closest("li")).toHaveAttribute(
      "data-cursor",
      "active",
    );
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

  it("正常系: / で絞り込みの入力欄が出て, 入力した語を含むものだけが残り, 入力中は j や d を一覧の操作にしないこと", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPane(true, ["/a/memo.md", "/b/todo.txt"]);

    await user.keyboard("/");
    const input = screen.getByLabelText("left list filter");
    expect(input).toHaveFocus();
    await user.keyboard("td");

    expect(input).toHaveValue("td");
    expect(screen.queryByText("/b/todo.txt")).not.toBeInTheDocument();
    expect(screen.getByText("一致するものがありません.")).toBeInTheDocument();
    expect(handlers.onRemove).not.toHaveBeenCalled();

    await user.clear(input);
    await user.keyboard("TODO");
    expect(screen.queryByText("/a/memo.md")).not.toBeInTheDocument();
    expect(screen.getByText("/b/todo.txt")).toBeInTheDocument();
  });

  it("正常系: Enter で入力を終えると絞り込みは残り, 絞り込んだ一覧で選んだり外したりでき, Ctrl-S で入力欄へ戻ること", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPane(true, ["/a/memo.md", "/b/todo.txt"]);

    await user.keyboard("/todo{Enter}");
    expect(screen.getByLabelText("left list filter")).not.toHaveFocus();
    await user.keyboard("{Enter}");
    expect(handlers.onSelect).toHaveBeenCalledWith("/b/todo.txt");
    await user.keyboard("d");
    expect(handlers.onRemove).toHaveBeenCalledWith("/b/todo.txt");

    await user.keyboard("{Control>}s{/Control}");
    expect(screen.getByLabelText("left list filter")).toHaveFocus();
  });

  it("正常系: Esc で絞り込みを解除し, 絞り込んでいないときの Esc は一覧を閉じること", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPane(true, ["/a/memo.md", "/b/todo.txt"]);

    await user.keyboard("/todo{Escape}");
    expect(screen.queryByLabelText("left list filter")).toBeNull();
    expect(screen.getByText("/a/memo.md")).toBeInTheDocument();
    expect(handlers.onCancel).not.toHaveBeenCalled();

    await user.keyboard("/todo{Enter}{Escape}");
    expect(screen.queryByLabelText("left list filter")).toBeNull();
    expect(handlers.onCancel).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
  });

  it("境界: / を 2 回押しても入力欄は 1 つで, 一覧が空のときは「一致するものがありません」でなく空の表示のままであること", async () => {
    const user = userEvent.setup();
    renderPane(true, []);

    await user.keyboard("/");
    await user.keyboard("{Enter}/");
    expect(screen.getAllByLabelText("left list filter")).toHaveLength(1);
    expect(screen.getByLabelText("left list filter")).toHaveFocus();
    expect(screen.getByText("登録されていません.")).toBeInTheDocument();
  });
});
