import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PathBar from "../features/explorer/components/PathBar";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

/** 補完 (complete_path) の結果を設定する. */
function mockCandidates(candidates: string[]): void {
  mockedInvoke.mockImplementation((cmd) =>
    cmd === "complete_path"
      ? Promise.resolve(candidates)
      : Promise.resolve(undefined),
  );
}

/** 入力欄を空にして, 指定した文字列を入力した状態の PathBar を描画する. */
async function renderBar(typed: string) {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(
    <PathBar
      path="/h"
      onSubmit={onSubmit}
      inputRef={() => {}}
      label="left path"
    />,
  );
  const input = screen.getByLabelText("left path");
  await user.clear(input);
  await user.type(input, typed);
  return { user, input, onSubmit };
}

const THREE = ["/h/rs-editor/", "/h/rs-filer/", "/h/rs-todo/"];

describe("PathBar の補完", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 候補が複数あれば, 共通の先頭部分まで補完して, 一覧を出すこと", async () => {
    mockCandidates(THREE);
    const { user, input } = await renderBar("/h/r");

    await user.keyboard("{Tab}");

    await waitFor(() => expect(input).toHaveValue("/h/rs-"));
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "rs-editor/",
      "rs-filer/",
      "rs-todo/",
    ]);
    // 一覧は表示だけで, どの候補も選んでいない. フォーカスは入力欄のまま.
    expect(
      options.every((o) => o.getAttribute("aria-selected") === "false"),
    ).toBe(true);
    expect(input).toHaveFocus();
  });

  it("正常系: 候補が 1 つなら, その候補まで補完して, 一覧は出さないこと", async () => {
    mockCandidates(["/h/rs-filer/"]);
    const { user, input } = await renderBar("/h/rs-f");

    await user.keyboard("{Tab}");

    await waitFor(() => expect(input).toHaveValue("/h/rs-filer/"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("正常系: 候補が無ければ, 入力を変えず, 一覧も出さないこと", async () => {
    mockCandidates([]);
    const { user, input } = await renderBar("/h/zzz");

    await user.keyboard("{Tab}");

    await waitFor(() => expect(mockedInvoke).toHaveBeenCalled());
    expect(input).toHaveValue("/h/zzz");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("正常系: 一覧が出ている間, Tab と Shift+Tab で候補を選び, 先頭と末尾はつながって回ること", async () => {
    mockCandidates(THREE);
    const { user, input } = await renderBar("/h/r");
    await user.keyboard("{Tab}");
    await screen.findByRole("listbox");

    await user.keyboard("{Tab}");
    expect(input).toHaveValue("/h/rs-editor/");
    expect(screen.getByRole("option", { name: "rs-editor/" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{Tab}{Tab}");
    expect(input).toHaveValue("/h/rs-todo/");
    await user.keyboard("{Tab}");
    expect(input).toHaveValue("/h/rs-editor/");
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(input).toHaveValue("/h/rs-todo/");
    // 一覧は, 選んでも閉じない. 補完し直すこともしない (呼び出しは最初の 1 回だけ).
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it("正常系: 一覧が出ている間, ↓ と ↑ でも候補を選べること", async () => {
    mockCandidates(THREE);
    const { user, input } = await renderBar("/h/r");
    await user.keyboard("{Tab}");
    await screen.findByRole("listbox");

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveValue("/h/rs-editor/");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveValue("/h/rs-filer/");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("/h/rs-editor/");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("/h/rs-todo/");
  });

  it("正常系: 候補を選んで Enter を押すと, その候補を確定して一覧を閉じること", async () => {
    mockCandidates(THREE);
    const { user, input, onSubmit } = await renderBar("/h/r");
    await user.keyboard("{Tab}");
    await screen.findByRole("listbox");
    await user.keyboard("{ArrowDown}{ArrowDown}");

    await user.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("/h/rs-filer/");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).not.toHaveFocus();
  });

  it("正常系: 一覧が出ている間の Esc は一覧だけ閉じ, もう一度押すと編集を取り消すこと", async () => {
    mockCandidates(THREE);
    const { user, input, onSubmit } = await renderBar("/h/r");
    await user.keyboard("{Tab}");
    await screen.findByRole("listbox");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("/h/rs-");
    expect(input).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("/h");
    expect(input).not.toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("正常系: 候補をクリックすると, 入力欄に入れて一覧を閉じ, フォーカスは入力欄に残ること", async () => {
    mockCandidates(THREE);
    const { user, input } = await renderBar("/h/r");
    await user.keyboard("{Tab}");
    await screen.findByRole("listbox");

    await user.click(screen.getByRole("option", { name: "rs-todo/" }));

    expect(input).toHaveValue("/h/rs-todo/");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("正常系: 文字を入力すると一覧が閉じ, もう一度 Tab を押すと補完し直すこと", async () => {
    mockCandidates(THREE);
    const { user, input } = await renderBar("/h/r");
    await user.keyboard("{Tab}");
    await screen.findByRole("listbox");

    await user.keyboard("f");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    mockCandidates(["/h/rs-filer/"]);
    await user.keyboard("{Tab}");
    await waitFor(() => expect(input).toHaveValue("/h/rs-filer/"));
  });

  it("正常系: フォーカスが外れると一覧が閉じること", async () => {
    mockCandidates(THREE);
    const { user, input } = await renderBar("/h/r");
    await user.keyboard("{Tab}");
    await screen.findByRole("listbox");

    fireEvent.blur(input);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("異常系: 補完に失敗しても, 入力を変えず, 一覧も出さないこと", async () => {
    mockedInvoke.mockRejectedValue("失敗");
    const { user, input } = await renderBar("/h/r");

    await user.keyboard("{Tab}");

    await waitFor(() => expect(mockedInvoke).toHaveBeenCalled());
    expect(input).toHaveValue("/h/r");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("境界: 一覧が無いときの ↓ ↑ は何もしないこと", async () => {
    mockCandidates(THREE);
    const { user, input } = await renderBar("/h/r");

    await user.keyboard("{ArrowDown}{ArrowUp}");

    expect(input).toHaveValue("/h/r");
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("正常系: Windows 形式の候補は, 最後のディレクトリ名だけを一覧に表示すること", async () => {
    mockCandidates(["C:\\work\\aa\\", "C:\\work\\ab\\"]);
    const { user } = await renderBar("C:\\work\\a");

    await user.keyboard("{Tab}");

    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["aa\\", "ab\\"]);
  });
});
