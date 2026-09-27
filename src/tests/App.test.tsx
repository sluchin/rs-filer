import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";

// @tauri-apps/api/core の invoke コマンドをモック
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

/** 指定したペインの内側だけを対象にする (ステータスバーの表示と区別するため). */
const paneOf = (pane: "left" | "right") =>
  within(screen.getByRole("region", { name: `${pane} pane` }));

/** invoke の引数から `path` を取り出すヘルパー. */
const pathOf = (args: unknown): unknown =>
  (args as { path?: unknown } | undefined)?.path;

describe("App (Dual Pane)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 初期化時に左右両方のペインへホームディレクトリの内容が読み込まれること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/mock/home");
      }
      if (cmd === "read_directory" && pathOf(args) === "/mock/home") {
        return Promise.resolve([
          { name: "Documents", path: "/mock/home/Documents", is_dir: true },
          { name: "file.txt", path: "/mock/home/file.txt", is_dir: false },
        ]);
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    await waitFor(() => {
      expect(paneOf("left").getByText("Documents")).toBeInTheDocument();
      expect(paneOf("right").getByText("Documents")).toBeInTheDocument();
      expect(paneOf("left").getByText("file.txt")).toBeInTheDocument();
      expect(paneOf("right").getByText("file.txt")).toBeInTheDocument();
    });
  });

  it("異常系: get_home_dir 失敗時にルート ('/') へフォールバックして読み込まれること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.reject("Home dir read error");
      }
      if (cmd === "read_directory" && pathOf(args) === "/") {
        return Promise.resolve([
          { name: "root_item", path: "/root_item", is_dir: false },
        ]);
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    await waitFor(() => {
      expect(paneOf("left").getByText("root_item")).toBeInTheDocument();
      expect(paneOf("right").getByText("root_item")).toBeInTheDocument();
    });
  });

  it("異常系: read_directory 失敗時にエラーメッセージが表示されること", async () => {
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/mock/home");
      }
      if (cmd === "read_directory") {
        return Promise.reject("Permission denied");
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("エラー: Permission denied")).toBeInTheDocument();
    });
  });

  it("操作系: 左右ペインそれぞれのパス入力フィールドの変更および Enter 実行が動作すること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/mock/home");
      }
      if (cmd === "read_directory" && pathOf(args) === "/mock/home") {
        return Promise.resolve([]);
      }
      if (cmd === "read_directory" && pathOf(args) === "/left/custom") {
        return Promise.resolve([
          { name: "left_item", path: "/left/custom/left_item", is_dir: false },
        ]);
      }
      if (cmd === "read_directory" && pathOf(args) === "/right/custom") {
        return Promise.resolve([
          {
            name: "right_item",
            path: "/right/custom/right_item",
            is_dir: false,
          },
        ]);
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    const inputs = await screen.findAllByDisplayValue("/mock/home");

    // 左ペイン入力
    fireEvent.change(inputs[0], { target: { value: "/left/custom" } });
    fireEvent.keyDown(inputs[0], { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(paneOf("left").getByText("left_item")).toBeInTheDocument();
    });

    // 右ペイン入力
    fireEvent.change(inputs[1], { target: { value: "/right/custom" } });
    fireEvent.keyDown(inputs[1], { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(paneOf("right").getByText("right_item")).toBeInTheDocument();
    });
  });

  it("環境設定: 本番環境 (DEV = false) の場合にログレベルが warn に設定されること", async () => {
    vi.stubEnv("DEV", false);
    vi.resetModules();
    const { default: ProductionApp } = await import("../App");

    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/mock/home");
      }
      if (cmd === "read_directory") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<ProductionApp />);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalled();
    });

    vi.unstubAllEnvs();
  });

  it("境界: ルート ('/') では親ディレクトリの行 (..) が表示されないこと", async () => {
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === "get_home_dir") return Promise.resolve("/");
      return Promise.resolve([]);
    });

    render(<App />);

    await screen.findAllByDisplayValue("/");

    expect(screen.queryByText("..")).not.toBeInTheDocument();
  });

  it("操作系: 親ディレクトリの行 (..) をダブルクリックすると親へ移動すること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") return Promise.resolve("/mock/home");
      if (cmd === "read_directory" && pathOf(args) === "/mock") {
        return Promise.resolve([
          { name: "home", path: "/mock/home", is_dir: true },
        ]);
      }
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByDisplayValue("/mock/home");

    await user.dblClick(paneOf("left").getByText(".."));

    expect(await paneOf("left").findByText("home")).toBeInTheDocument();
  });

  it("境界: パス入力欄で Enter 以外のキーを押してもディレクトリを読み込まないこと", async () => {
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === "get_home_dir") return Promise.resolve("/mock/home");
      return Promise.resolve([]);
    });

    render(<App />);

    const inputs = await screen.findAllByDisplayValue("/mock/home");
    mockedInvoke.mockClear();

    fireEvent.keyDown(inputs[0], { key: "a", code: "KeyA" });

    expect(mockedInvoke).not.toHaveBeenCalled();
  });
});

/** 1 件のファイルと 1 件のディレクトリを持つホームディレクトリを模した invoke のモックを設定する. */
function mockHome(
  extra: (cmd: string, args: unknown) => Promise<unknown> | undefined = () =>
    undefined,
): void {
  mockedInvoke.mockImplementation((cmd, args) => {
    const handled = extra(cmd, args);
    if (handled) return handled;
    if (cmd === "get_home_dir") return Promise.resolve("/mock/home");
    if (cmd === "read_directory" && pathOf(args) === "/mock/home") {
      return Promise.resolve([
        { name: "FolderA", path: "/mock/home/FolderA", is_dir: true },
        { name: "b.txt", path: "/mock/home/b.txt", is_dir: false },
      ]);
    }
    if (cmd === "read_directory" && pathOf(args) === "/mock/home/FolderA") {
      return Promise.resolve([
        { name: "in.txt", path: "/mock/home/FolderA/in.txt", is_dir: false },
      ]);
    }
    return Promise.resolve(cmd === "read_directory" ? [] : undefined);
  });
}

/** 左ペインが読み込まれるまで待つ. */
async function renderLoaded(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  render(<App />);
  await screen.findAllByText("FolderA");
  return user;
}

/** 左右ペインの現在のカーソル行の名前を返す. */
const cursorNames = (): string[] =>
  screen
    .queryAllByRole("listitem")
    .filter((li) => li.getAttribute("aria-current") === "true")
    .map((li) => li.querySelector(".file-name")?.textContent ?? "");

describe("App (キーボード操作)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: j/k と矢印キーでカーソルが移動し, 範囲外には出ないこと", async () => {
    mockHome();
    const user = await renderLoaded();

    expect(cursorNames()).toEqual(["FolderA"]);
    await user.keyboard("j");
    expect(cursorNames()).toEqual(["b.txt"]);
    await user.keyboard("{ArrowDown}");
    expect(cursorNames()).toEqual(["b.txt"]);
    await user.keyboard("k");
    expect(cursorNames()).toEqual(["FolderA"]);
    await user.keyboard("{ArrowUp}");
    expect(cursorNames()).toEqual(["FolderA"]);
  });

  it("正常系: Tab と C-x o でアクティブペインが切り替わること", async () => {
    mockHome();
    const user = await renderLoaded();
    const left = screen.getByRole("region", { name: "left pane" });
    const right = screen.getByRole("region", { name: "right pane" });
    expect(left).toHaveAttribute("data-active", "true");

    await user.keyboard("{Tab}");
    expect(right).toHaveAttribute("data-active", "true");
    expect(cursorNames()).toHaveLength(1);

    await user.keyboard("{Control>}x{/Control}o");
    expect(left).toHaveAttribute("data-active", "true");
  });

  it("正常系: クリックでペインがアクティブになりカーソルが移ること (ディレクトリには入らない)", async () => {
    mockHome();
    const user = await renderLoaded();

    await user.click(screen.getAllByText("b.txt")[1]);

    expect(screen.getByRole("region", { name: "right pane" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(cursorNames()).toEqual(["b.txt"]);
    await user.click(screen.getAllByText("FolderA")[0]);
    expect(paneOf("left").queryByText("in.txt")).not.toBeInTheDocument();
  });

  it("正常系: ダブルクリックでディレクトリに入り, ファイルは外部アプリで開くこと", async () => {
    mockHome();
    const user = await renderLoaded();

    await user.dblClick(screen.getAllByText("b.txt")[0]);
    expect(mockedInvoke).toHaveBeenCalledWith("open_item", {
      path: "/mock/home/b.txt",
    });

    await user.dblClick(screen.getAllByText("FolderA")[0]);
    expect(await paneOf("left").findByText("in.txt")).toBeInTheDocument();
  });

  it.each(["{Enter}", "f", "l", "{ArrowRight}"])(
    "正常系: %s でディレクトリに入り, h で親へ戻って元のディレクトリにカーソルが合うこと",
    async (openKey) => {
      mockHome();
      const user = await renderLoaded();

      await user.keyboard(openKey);
      expect(await paneOf("left").findByText("in.txt")).toBeInTheDocument();
      expect(cursorNames()).toEqual(["in.txt"]);

      await user.keyboard("h");
      await waitFor(() => expect(cursorNames()).toEqual(["FolderA"]));
      expect(paneOf("left").queryByText("in.txt")).not.toBeInTheDocument();
    },
  );

  it("正常系: ファイル上で Enter を押すと外部アプリで開き, x と e でも開けること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("j{Enter}x");
    expect(mockedInvoke).toHaveBeenCalledWith("open_item", {
      path: "/mock/home/b.txt",
    });
    await user.keyboard("e");
    expect(mockedInvoke).toHaveBeenCalledWith("open_in_editor", {
      path: "/mock/home/b.txt",
    });
  });

  it("異常系: 外部アプリの起動に失敗するとエラーが表示されること", async () => {
    mockHome((cmd) =>
      cmd === "open_item" ? Promise.reject("起動できません") : undefined,
    );
    const user = await renderLoaded();
    await user.keyboard("jx");
    expect(
      await screen.findByText("エラー: 起動できません"),
    ).toBeInTheDocument();
  });

  it("異常系: 項目が無いときに開く・名前変更・削除を実行するとエラーが表示されること", async () => {
    mockedInvoke.mockImplementation((cmd) =>
      cmd === "get_home_dir" ? Promise.resolve("/empty") : Promise.resolve([]),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByDisplayValue("/empty");

    await user.keyboard("{Enter}");
    expect(screen.queryByText(/対象の項目/)).not.toBeInTheDocument();
    await user.keyboard("r");
    expect(
      screen.getByText("エラー: 対象の項目が選択されていません."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("正常系: Backspace で親へ移動し, g でパス入力欄にフォーカスして Enter で移動できること", async () => {
    mockHome();
    const user = await renderLoaded();

    await user.keyboard("g");
    const input = screen.getAllByLabelText("left path")[0];
    expect(input).toHaveFocus();

    await user.keyboard("/mock/home/FolderA{Enter}");
    expect(await paneOf("left").findByText("in.txt")).toBeInTheDocument();
    expect(input).not.toHaveFocus();

    await user.keyboard("{Backspace}");
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("read_directory", {
        path: "/mock/home",
      }),
    );
  });

  it("正常系: パス入力欄で Esc を押すとフォーカスが外れ, 入力中のキーはコマンドにならないこと", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("g");
    await user.keyboard("j");
    expect(cursorNames()).toEqual(["FolderA"]);
    await user.keyboard("{Escape}");
    expect(screen.getAllByLabelText("left path")[0]).not.toHaveFocus();
  });

  it("正常系: F5 と C-l で, カーソル位置を保ったまま再読み込みされること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("j");
    mockedInvoke.mockClear();

    await user.keyboard("{F5}");
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(1));
    expect(cursorNames()).toEqual(["b.txt"]);

    await user.keyboard("{Control>}l{/Control}");
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(2));
  });

  it("正常系: M-d でドライブ一覧が開き, 選んだドライブへ移動できること", async () => {
    mockHome((cmd) =>
      cmd === "list_drives" ? Promise.resolve(["C:/", "D:/"]) : undefined,
    );
    const user = await renderLoaded();

    await user.keyboard("{Alt>}d{/Alt}");
    await user.click(await screen.findByRole("button", { name: "D:/" }));

    expect(mockedInvoke).toHaveBeenCalledWith("read_directory", {
      path: "D:/",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("正常系: ドライブ選択を Esc で閉じられ, 閉じている間は他のキーが効かないこと", async () => {
    mockHome((cmd) =>
      cmd === "list_drives" ? Promise.resolve(["/"]) : undefined,
    );
    const user = await renderLoaded();
    await user.keyboard("{Alt>}d{/Alt}");
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("異常系: ドライブ一覧の取得に失敗するとエラーが表示されること", async () => {
    mockHome((cmd) =>
      cmd === "list_drives" ? Promise.reject("取得不可") : undefined,
    );
    const user = await renderLoaded();
    await user.keyboard("{Alt>}d{/Alt}");
    expect(await screen.findByText("エラー: 取得不可")).toBeInTheDocument();
  });

  it("正常系: M-g でもパス入力欄にフォーカスされること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}g{/Alt}");
    expect(screen.getAllByLabelText("left path")[0]).toHaveFocus();
  });
});

describe("App (作成・名前変更・削除)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["N", "新規ディレクトリ作成", "create_directory"],
    ["+", "新規ディレクトリ作成", "create_directory"],
    [
      "{Control>}x{/Control}{Control>}f{/Control}",
      "新規ファイル作成",
      "create_file",
    ],
  ])(
    "正常系: %s で名前を入力して作成でき, 作成後にカーソルが合うこと",
    async (keys, title, command) => {
      let created = false;
      mockedInvoke.mockImplementation((cmd, args) => {
        if (cmd === "get_home_dir") return Promise.resolve("/mock/home");
        if (cmd === command) {
          created = true;
          return Promise.resolve();
        }
        if (cmd === "read_directory" && pathOf(args) === "/mock/home") {
          return Promise.resolve([
            { name: "a", path: "/mock/home/a", is_dir: false },
            ...(created
              ? [{ name: "new", path: "/mock/home/new", is_dir: false }]
              : []),
          ]);
        }
        return Promise.resolve(undefined);
      });
      const user = userEvent.setup();
      render(<App />);
      await screen.findAllByText("a");

      await user.keyboard(keys);
      expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
      await user.keyboard("new{Enter}");

      await waitFor(() => expect(cursorNames()).toEqual(["new"]));
      expect(mockedInvoke).toHaveBeenCalledWith(command, {
        parent: "/mock/home",
        name: "new",
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it("異常系: 作成に失敗するとエラーが表示されること", async () => {
    mockHome((cmd) =>
      cmd === "create_directory" ? Promise.reject("既に存在します") : undefined,
    );
    const user = await renderLoaded();
    await user.keyboard("Nx{Enter}");
    expect(
      await screen.findByText("エラー: 既に存在します"),
    ).toBeInTheDocument();
  });

  it("正常系: キャンセルボタンと Esc で入力ダイアログを閉じられること", async () => {
    mockHome();
    const user = await renderLoaded();

    await user.keyboard("N");
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.keyboard("N{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "create_directory",
      expect.anything(),
    );
  });

  it("正常系: 枠外クリックでダイアログが閉じ, 枠内クリックでは閉じないこと", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("N");
    await user.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("正常系: r で名前を変更でき, 同じ名前ならバックエンドを呼ばないこと", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("j");

    await user.keyboard("r");
    const input = screen.getByLabelText("名前");
    expect(input).toHaveValue("b.txt");
    await user.keyboard("{Enter}");
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "rename_item",
      expect.anything(),
    );

    await user.keyboard("{F2}");
    await user.clear(screen.getByLabelText("名前"));
    await user.keyboard("c.txt{Enter}");
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("rename_item", {
        path: "/mock/home/b.txt",
        newName: "c.txt",
      }),
    );
  });

  it("正常系: d でゴミ箱へ移動する確認が出て, y で削除されること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("j");

    await user.keyboard("d");
    expect(
      screen.getByText("「b.txt」をゴミ箱へ移動しますか? (y/n)"),
    ).toBeInTheDocument();
    await user.keyboard("y");

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("delete_item", {
        path: "/mock/home/b.txt",
        permanent: false,
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("正常系: 確認で n を押すと削除されないこと", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Delete}n");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "delete_item",
      expect.anything(),
    );
  });

  it("正常系: D と Shift+Delete は完全削除の確認になり, 「はい」で実行されること", async () => {
    mockHome();
    const user = await renderLoaded();

    await user.keyboard("D");
    expect(
      screen.getByRole("dialog", { name: "完全に削除" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.keyboard("{Shift>}{Delete}{/Shift}");
    await user.click(screen.getByRole("button", { name: "はい" }));

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("delete_item", {
        path: "/mock/home/FolderA",
        permanent: true,
      }),
    );
  });

  it("異常系: 削除に失敗するとエラーが表示されること", async () => {
    mockHome((cmd) =>
      cmd === "delete_item" ? Promise.reject("削除できません") : undefined,
    );
    const user = await renderLoaded();
    await user.keyboard("dy");
    expect(
      await screen.findByText("エラー: 削除できません"),
    ).toBeInTheDocument();
  });
});

describe("App (分岐の網羅)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("境界: 割り当ての無いキー, 修飾キー単独ではコマンドが実行されず, window 直接のイベントは処理されること", async () => {
    mockHome();
    const user = await renderLoaded();
    mockedInvoke.mockClear();

    await user.keyboard("z{Shift}");
    expect(cursorNames()).toEqual(["FolderA"]);
    expect(mockedInvoke).not.toHaveBeenCalled();

    // 発生元が要素でない (window) 場合は入力欄ではないので, コマンドとして処理される.
    fireEvent.keyDown(window, { key: "j" });
    expect(cursorNames()).toEqual(["b.txt"]);
  });

  it("正常系: 右ペインがアクティブでも親移動・再読み込み・削除・名前変更が右ペインに作用すること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Tab}");

    await user.keyboard("{Enter}");
    expect(await paneOf("right").findByText("in.txt")).toBeInTheDocument();
    await user.keyboard("h");
    await waitFor(() => expect(cursorNames()).toEqual(["FolderA"]));

    mockedInvoke.mockClear();
    await user.keyboard("{F5}");
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("read_directory", {
        path: "/mock/home",
      }),
    );

    await user.keyboard("r");
    expect(screen.getByLabelText("名前")).toHaveValue("FolderA");
    await user.keyboard("{Escape}d");
    expect(screen.getByText(/「FolderA」をゴミ箱/)).toBeInTheDocument();
  });

  it("境界: ルートでは h を押しても移動せず, 空のペインで d を押してもダイアログが開かないこと", async () => {
    mockedInvoke.mockImplementation((cmd) =>
      cmd === "get_home_dir" ? Promise.resolve("/") : Promise.resolve([]),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByDisplayValue("/");
    mockedInvoke.mockClear();

    await user.keyboard("hd");

    expect(mockedInvoke).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("正常系: 右ペインがアクティブなとき, 作成先は右ペインのディレクトリになること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Tab}{Enter}");
    await paneOf("right").findByText("in.txt");

    await user.keyboard("Nx{Enter}");

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("create_directory", {
        parent: "/mock/home/FolderA",
        name: "x",
      }),
    );
  });

  it("異常系: 項目が無いときに x / e を押すとエラーが表示され, 外部アプリは起動されないこと", async () => {
    mockedInvoke.mockImplementation((cmd) =>
      cmd === "get_home_dir" ? Promise.resolve("/empty") : Promise.resolve([]),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByDisplayValue("/empty");

    await user.keyboard("xe");

    expect(
      screen.getByText("エラー: 対象の項目が選択されていません."),
    ).toBeInTheDocument();
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "open_item",
      expect.anything(),
    );
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "open_in_editor",
      expect.anything(),
    );
  });

  it("正常系: c でカーソル位置の項目が対向ペインのディレクトリへコピーされ, 対向ペインが再読み込みされること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Tab}{Enter}");
    await paneOf("right").findByText("in.txt");
    await user.keyboard("{Tab}j");
    mockedInvoke.mockClear();

    await user.keyboard("c");

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("copy_item", {
        srcPath: "/mock/home/b.txt",
        destDir: "/mock/home/FolderA",
      }),
    );
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("read_directory", {
        path: "/mock/home/FolderA",
      }),
    );
  });

  it("異常系: コピーに失敗するとエラーが表示されること", async () => {
    mockHome((cmd) =>
      cmd === "copy_item" ? Promise.reject("コピーできません") : undefined,
    );
    const user = await renderLoaded();
    await user.keyboard("c");
    expect(
      await screen.findByText("エラー: コピーできません"),
    ).toBeInTheDocument();
  });

  it("異常系: 項目が無いときに c を押すとエラーが表示されること", async () => {
    mockedInvoke.mockImplementation((cmd) =>
      cmd === "get_home_dir" ? Promise.resolve("/empty") : Promise.resolve([]),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByDisplayValue("/empty");
    await user.keyboard("c");
    expect(
      screen.getByText("エラー: 対象の項目が選択されていません."),
    ).toBeInTheDocument();
  });

  it("正常系: 右ペインがアクティブなとき, c で左ペインのディレクトリへコピーされること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Tab}j");

    await user.keyboard("c");

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("copy_item", {
        srcPath: "/mock/home/b.txt",
        destDir: "/mock/home",
      }),
    );
  });

  it("正常系: ステータスバーにカーソル位置の名前とディスク容量が表示され, 列に詳細が表示されること", async () => {
    mockHome((cmd) =>
      cmd === "get_disk_space"
        ? Promise.resolve({ free: 1024 ** 3, total: 2 * 1024 ** 3 })
        : undefined,
    );
    await renderLoaded();

    expect(
      await screen.findByText("Free: 1GB, Total: 2GB"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("FolderA")).toHaveLength(3);
    expect(screen.getAllByText("ファイル名")).toHaveLength(2);
    expect(screen.getAllByText("d-w-")).toHaveLength(2);
  });

  it("異常系: ディスク容量の取得に失敗しても表示されず, 画面は動作すること", async () => {
    mockHome((cmd) =>
      cmd === "get_disk_space" ? Promise.reject("取得不可") : undefined,
    );
    await renderLoaded();
    expect(screen.queryByText(/Free:/)).not.toBeInTheDocument();
  });

  it("正常系: ディレクトリ・ファイル・親ディレクトリにそれぞれのアイコンが表示されること", async () => {
    mockHome();
    await renderLoaded();
    const left = paneOf("left").getAllByRole("listitem");
    const icons = left.map((li) => li.querySelector("svg")?.dataset.icon);
    expect(icons).toEqual(["parent", "dir", "file"]);
  });
});
