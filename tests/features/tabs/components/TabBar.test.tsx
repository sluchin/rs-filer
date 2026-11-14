import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TabBar from "@/features/tabs/components/TabBar";

const TABS = ["a", "b", "c"].map((label, i) => ({
  label,
  title: `左: /${label} / 右: /${label}`,
  active: i === 0,
}));

/** タブの要素を, 幅 100 の箱として横に並べる (jsdom は大きさを持たないため). */
function layout(): HTMLElement[] {
  const items = Array.from(document.querySelectorAll<HTMLElement>(".tab-item"));
  items.forEach((el, i) => {
    el.getBoundingClientRect = () =>
      ({ left: i * 100, right: i * 100 + 100 }) as DOMRect;
  });
  return items;
}

function renderBar() {
  const handlers = {
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onCloseRight: vi.fn(),
    onCloseOthers: vi.fn(),
    onReorder: vi.fn(),
    onNew: vi.fn(),
  };
  render(<TabBar tabs={TABS} {...handlers} />);
  return { handlers, items: layout() };
}

describe("TabBar のドラッグ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: タブを右へドラッグして離すと, 動かす先の番号が渡り, 選択は起きないこと", () => {
    const { handlers, items } = renderBar();

    fireEvent.mouseDown(items[0], { button: 0, clientX: 50 });
    // 最初の動きでドラッグが始まり, 次の動きから落とす位置を追う
    fireEvent.mouseMove(window, { clientX: 120 });
    fireEvent.mouseMove(window, { clientX: 160 });
    expect(items[0]).toHaveAttribute("data-dragging", "true");
    expect(items[1]).toHaveAttribute("data-drop", "after");
    fireEvent.mouseMove(window, { clientX: 260 });
    fireEvent.mouseUp(window, { clientX: 260 });
    fireEvent.click(screen.getByRole("tab", { name: "a" }));

    expect(handlers.onReorder).toHaveBeenCalledWith(0, 2);
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(items[0]).toHaveAttribute("data-dragging", "false");
  });

  it("正常系: 左へドラッグすると手前に線が出て, 端の外まで動かすと端のタブになること", () => {
    const { handlers, items } = renderBar();

    fireEvent.mouseDown(items[2], { button: 0, clientX: 250 });
    fireEvent.mouseMove(window, { clientX: 220 });
    fireEvent.mouseMove(window, { clientX: 150 });
    expect(items[1]).toHaveAttribute("data-drop", "before");
    fireEvent.mouseMove(window, { clientX: -40 });
    fireEvent.mouseUp(window, { clientX: -40 });
    expect(handlers.onReorder).toHaveBeenCalledWith(2, 0);

    fireEvent.mouseDown(items[0], { button: 0, clientX: 50 });
    fireEvent.mouseMove(window, { clientX: 400 });
    fireEvent.mouseUp(window, { clientX: 400 });
    expect(handlers.onReorder).toHaveBeenLastCalledWith(0, 2);
  });

  it("正常系: 動きが小さければクリックのままで, 動かさず, タブを選べること", () => {
    const { handlers, items } = renderBar();

    fireEvent.mouseDown(items[1], { button: 0, clientX: 150 });
    fireEvent.mouseMove(window, { clientX: 152 });
    fireEvent.mouseUp(window, { clientX: 152 });
    fireEvent.click(screen.getByRole("tab", { name: "b" }));

    expect(handlers.onReorder).not.toHaveBeenCalled();
    expect(handlers.onSelect).toHaveBeenCalledWith(1);
  });

  it("正常系: 左ボタン以外や, 閉じるボタンを押してもドラッグしないこと", () => {
    const { handlers, items } = renderBar();

    fireEvent.mouseDown(items[0], { button: 2, clientX: 50 });
    fireEvent.mouseMove(window, { clientX: 250 });
    fireEvent.mouseUp(window, { clientX: 250 });
    fireEvent.mouseDown(screen.getByLabelText("タブを閉じる: a"), {
      button: 0,
      clientX: 50,
    });
    fireEvent.mouseMove(window, { clientX: 250 });
    fireEvent.mouseUp(window, { clientX: 250 });

    expect(handlers.onReorder).not.toHaveBeenCalled();
  });

  it("正常系: 同じ位置へ戻したときも onReorder は呼ばれ(同じ番号), 次のクリックは普通に選べること", () => {
    const { handlers, items } = renderBar();

    fireEvent.mouseDown(items[1], { button: 0, clientX: 150 });
    fireEvent.mouseMove(window, { clientX: 250 });
    fireEvent.mouseMove(window, { clientX: 150 });
    fireEvent.mouseUp(window, { clientX: 150 });
    expect(handlers.onReorder).toHaveBeenCalledWith(1, 1);

    fireEvent.click(screen.getByRole("tab", { name: "b" }));
    fireEvent.click(screen.getByRole("tab", { name: "b" }));
    expect(handlers.onSelect).toHaveBeenCalledTimes(1);
  });
});
