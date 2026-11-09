import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OperationDialog from "@/features/operations/components/OperationDialog";

/** 確認のダイアログを描画する. */
function renderConfirm() {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <OperationDialog
      dialog={{ kind: "confirm", title: "確認", message: "実行?", onConfirm }}
      onClose={onClose}
    />,
  );
  return { onConfirm, onClose, user: userEvent.setup() };
}

describe("OperationDialog の左右の矢印キー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 確認で, ← → により「はい」と「いいえ」を行き来し, 端では反対側へつながること", async () => {
    const { user } = renderConfirm();
    const yes = screen.getByRole("button", { name: "はい" });
    const no = screen.getByRole("button", { name: "いいえ" });
    expect(yes).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(no).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(yes).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(no).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(yes).toHaveFocus();
  });

  it("正常系: → で「いいえ」へ動かして Enter を押すと, 取り消しになること", async () => {
    const { user, onConfirm, onClose } = renderConfirm();
    await user.keyboard("{ArrowRight}{Enter}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("正常系: 確認で y は承諾, n は取り消し, 矢印以外のキーは何も動かさないこと", async () => {
    const { user, onConfirm, onClose } = renderConfirm();
    await user.keyboard("{ArrowDown}x");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("y");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.keyboard("n");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("正常系: 選択肢のダイアログで, ← → により選択肢のボタンを行き来できること", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(
      <OperationDialog
        dialog={{
          kind: "choice",
          title: "上書き",
          message: "上書きしますか?",
          choices: [
            { key: "y", label: "はい", run: vi.fn() },
            { key: "n", label: "いいえ", run },
            { key: "a", label: "全て上書き", run: vi.fn() },
          ],
        }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /はい/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /いいえ/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /全て上書き/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /はい/ })).toHaveFocus();
    // 「はい」から左へ 2 回で「いいえ」. そこで Enter を押すと, その選択肢が実行される
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("button", { name: /いいえ/ })).toHaveFocus();
    expect(run).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(run).toHaveBeenCalledTimes(1);
    // 矢印以外で, 選択肢のキーはそのまま使える
    await user.keyboard("n");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("正常系: 選択肢が 1 つも無いダイアログで ← → を押しても, 何も起きないこと", () => {
    render(
      <OperationDialog
        dialog={{ kind: "choice", title: "空", message: "?", choices: [] }}
        onClose={vi.fn()}
      />,
    );
    const body = screen.getByText("?").parentElement as HTMLElement;

    expect(fireEvent.keyDown(body, { key: "ArrowRight" })).toBe(true);
    expect(fireEvent.keyDown(body, { key: "ArrowLeft" })).toBe(true);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
