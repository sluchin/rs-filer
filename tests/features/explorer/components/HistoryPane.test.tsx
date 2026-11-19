import { fireEvent, render, screen } from "@testing-library/react";
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
    onRemove: vi.fn(),
    // 一覧を開くキーの判定は App がキーマップで行う. ここでは q を, 開くキーとみなす
    isToggleKey: vi.fn((e: KeyboardEvent) => e.key === "q"),
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

/** 一覧の高さを 200px, 1 行の高さを 20px とみなす (jsdom はレイアウトを計算しない). */
function stubLayout(): void {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    right: 0,
    width: 0,
    top: 0,
    bottom: 0,
    height: 20,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe("HistoryPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 一覧を出すと先頭の行がカーソルで, 画面に映る行の前後だけを描画し, カーソルの行が見えるようにスクロールすること", async () => {
    const user = userEvent.setup();
    stubLayout();
    const paths = Array.from({ length: 100 }, (_, i) => `/h/${i}`);
    const { list } = renderPane(true, paths);

    expect(screen.getByText("/h/0").closest("li")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.queryByText("/h/60")).not.toBeInTheDocument();
    expect(list.scrollTop).toBe(0);

    await user.keyboard("{ArrowDown}".repeat(15));
    // 16 行目 (添字 15) の下端が見えるまで: 16 * 20 - 200
    expect(list.scrollTop).toBe(120);

    await user.keyboard("{ArrowUp}".repeat(15));
    expect(list.scrollTop).toBe(0);
  });

  it("正常系: PageDown / PageUp は 10 行, End / Home は末尾 / 先頭へ動き, C-n C-p M-v M-> M-< n p Space も同じ働きをすること", async () => {
    const user = userEvent.setup();
    stubLayout();
    const paths = Array.from({ length: 100 }, (_, i) => `/h/${i}`);
    const { list } = renderPane(true, paths);
    const press = async (keys: string): Promise<void> => {
      await user.keyboard(keys);
      // jsdom は, scrollTop を変えても scroll イベントを送らない
      fireEvent.scroll(list);
    };
    const current = () =>
      list.querySelector('[aria-current="true"]')?.textContent;

    await press("{PageDown}");
    expect(current()).toContain("/h/10");
    await press("{PageUp}");
    expect(current()).toContain("/h/0");
    await press("{End}");
    expect(current()).toContain("/h/99");
    await press("{Home}");
    expect(current()).toContain("/h/0");
    await press("{Control>}n{/Control}n p {Control>}n{/Control}");
    expect(current()).toContain("/h/4");
    await press("{Control>}p{/Control}");
    expect(current()).toContain("/h/3");
    await press("{Alt>}>{/Alt}");
    expect(current()).toContain("/h/99");
    await press("{Alt>}v{/Alt}");
    expect(current()).toContain("/h/89");
    await press("{Alt>}<{/Alt}");
    expect(current()).toContain("/h/0");
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

    await user.keyboard("q");

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it("正常系: ほかの一覧を開くキーは onOtherListKey に渡り, 処理されたら何もせず, 処理されなければ通常どおり扱うこと", async () => {
    const user = userEvent.setup();
    const onOtherListKey = vi.fn((e: KeyboardEvent) => e.key === "b");
    render(
      <HistoryPane
        paneId="left"
        isActive
        history={["/a", "/b"]}
        historyIndex={1}
        onActivate={vi.fn()}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        onSwitchPane={vi.fn()}
        isToggleKey={() => false}
        onOtherListKey={onOtherListKey}
      />,
    );

    await user.keyboard("b");
    expect(onOtherListKey).toHaveBeenCalledTimes(1);
    await user.keyboard("k");
    expect(onOtherListKey).toHaveBeenCalledTimes(2);
    expect(screen.getByText("/a").closest("li")).toHaveAttribute(
      "data-cursor",
      "active",
    );
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

  it("正常系: 入力中の ↓ と ↑ で, 入力欄に居たまま絞り込んだ一覧のカーソルを動かせ, 端ではそれ以上動かないこと", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPane(true, [
      "/a/docs",
      "/b/music",
      "/c/docs/old",
    ]);

    await user.keyboard("/docs{ArrowUp}");
    expect(screen.getByLabelText("left history filter")).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}{Enter}");
    expect(handlers.onSelect).toHaveBeenLastCalledWith("/c/docs/old", 2);
    await user.keyboard("/{ArrowUp}{Enter}{Enter}");
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

  it("正常系: 行を右クリックすると, その行にカーソルを移し, パスと履歴上の位置と座標を渡すこと. onContextMenu が無ければ何もしないこと", () => {
    const onContextMenu = vi.fn();
    const { unmount } = render(
      <HistoryPane
        paneId="left"
        isActive
        history={["/a", "/b"]}
        historyIndex={1}
        onActivate={vi.fn()}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        onSwitchPane={vi.fn()}
        isToggleKey={() => false}
        onContextMenu={onContextMenu}
      />,
    );

    fireEvent.contextMenu(screen.getByText("/a"), { clientX: 3, clientY: 4 });

    expect(onContextMenu).toHaveBeenCalledWith("/a", 0, 3, 4);
    expect(screen.getByText("/a").closest("li")).toHaveAttribute(
      "aria-current",
      "true",
    );
    unmount();

    renderPane();
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    screen.getByText("/a").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("正常系: d で削除の印を付けて 1 行下へ進み, u で外し, x で印を付けた行の履歴上の位置を渡すこと", async () => {
    const user = userEvent.setup();
    const { handlers } = renderPane(true, ["/a", "/b", "/c"]);
    const row = (name: string) => screen.getByText(name).closest("li");

    await user.keyboard("x");
    expect(handlers.onRemove).not.toHaveBeenCalled();

    await user.keyboard("kkdd");
    expect(row("/a")).toHaveAttribute("data-flagged", "true");
    expect(row("/b")).toHaveAttribute("data-flagged", "true");
    expect(row("/c")).toHaveAttribute("aria-current", "true");

    await user.keyboard("kku");
    expect(row("/a")).toHaveAttribute("data-flagged", "false");

    await user.keyboard("x");
    expect(handlers.onRemove).toHaveBeenCalledWith([1]);
    expect(row("/b")).toHaveAttribute("data-flagged", "false");
  });

  it("境界: 絞り込みで行が無いときの d は何もしないこと. onRemove が無くても x で落ちないこと", async () => {
    const user = userEvent.setup();
    render(
      <HistoryPane
        paneId="left"
        isActive
        history={["/a"]}
        historyIndex={0}
        onActivate={vi.fn()}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        onSwitchPane={vi.fn()}
        isToggleKey={() => false}
      />,
    );
    await user.keyboard("dx");
    await user.keyboard("/zzz{Enter}d");
    expect(screen.getByText("一致するものがありません.")).toBeInTheDocument();
    await user.keyboard("/");
    await user.clear(screen.getByLabelText("left history filter"));
    await user.keyboard("{Enter}");
    await user.keyboard("dx");
    expect(screen.getByText("/a")).toBeInTheDocument();
  });
});
