import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ContextMenu from "@/components/ContextMenu";

/** 2 つの項目のメニューを表示して, 選んだときと閉じたときのモックを返す. */
function renderMenu(x = 10, y = 20) {
  const first = vi.fn();
  const second = vi.fn();
  const onClose = vi.fn();
  render(
    <div>
      <p>outside</p>
      <ContextMenu
        x={x}
        y={y}
        items={[
          { label: "first", onSelect: first },
          { label: "second", onSelect: second },
        ]}
        onClose={onClose}
      />
    </div>,
  );
  return { first, second, onClose };
}

/** 選んでいる項目の文字列を返す. */
const selectedLabel = (): string | null =>
  screen
    .getAllByRole("menuitem")
    .find((item) => item.getAttribute("data-selected") === "true")
    ?.textContent ?? null;

describe("ContextMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 右クリックした位置に表示し, 項目のクリックで, 閉じてから実行すること", async () => {
    const user = userEvent.setup();
    const { first, second, onClose } = renderMenu();

    expect(screen.getByRole("menu")).toHaveStyle({ left: "10px", top: "20px" });
    await user.click(screen.getByRole("menuitem", { name: "second" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("正常系: ↓ ↑ (j k) で項目を選び, Enter で実行すること. 端では反対の端へ回ること", async () => {
    const user = userEvent.setup();
    const { first, second, onClose } = renderMenu();

    expect(selectedLabel()).toBe("first");
    await user.keyboard("{ArrowDown}");
    expect(selectedLabel()).toBe("second");
    await user.keyboard("j");
    expect(selectedLabel()).toBe("first");
    await user.keyboard("k");
    expect(selectedLabel()).toBe("second");
    await user.keyboard("{ArrowUp}");
    expect(selectedLabel()).toBe("first");
    await user.keyboard("{ArrowUp}{Enter}");

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("正常系: マウスを乗せた項目を選ぶこと", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.hover(screen.getByRole("menuitem", { name: "second" }));

    expect(selectedLabel()).toBe("second");
  });

  it("正常系: Esc と C-g で, 実行せずに閉じること. ほかのキーは何もしないこと", async () => {
    const user = userEvent.setup();
    const { first, second, onClose } = renderMenu();

    await user.keyboard("x");
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await user.keyboard("{Control>}g{/Control}");

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it("正常系: メニューの外のクリックで閉じ, 中のクリックでは閉じないこと", () => {
    const { onClose } = renderMenu();

    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByText("outside"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("正常系: メニューの上の右クリックで, ブラウザのメニューを出さないこと", () => {
    renderMenu();

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    screen.getByRole("menu").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("境界: 画面の右と下にはみ出す位置では, 画面の中に戻すこと", () => {
    renderMenu(window.innerWidth + 50, window.innerHeight + 50);

    // テストの環境では, メニューの大きさは 0 なので, 画面の右下の端になる.
    expect(screen.getByRole("menu")).toHaveStyle({
      left: `${window.innerWidth}px`,
      top: `${window.innerHeight}px`,
    });
  });
});
