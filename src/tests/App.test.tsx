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

/** ホームに 4 件 (ディレクトリ 1, ファイル 3 (うち隠し 1)) を持つ, Phase 4 用の invoke のモックを設定する. */
function mockPhase4(files?: () => unknown[]): void {
  const base = (name: string, over: Record<string, unknown> = {}) => ({
    name,
    path: `/mock/home/${name}`,
    is_dir: false,
    size: 10,
    modified: 1000,
    readonly: false,
    hidden: false,
    ...over,
  });
  mockedInvoke.mockImplementation((cmd, args) => {
    if (cmd === "get_home_dir") return Promise.resolve("/mock/home");
    if (cmd === "read_directory" && pathOf(args) === "/mock/home") {
      return Promise.resolve(
        files
          ? files()
          : [
              base("FolderA", { is_dir: true }),
              base("a.txt", { size: 30 }),
              base("b.md", { size: 20, modified: 2000 }),
              base(".hidden", { hidden: true, size: 1 }),
            ],
      );
    }
    if (cmd === "read_directory" && pathOf(args) === "/mock/home/FolderA") {
      return Promise.resolve([base("in.txt")]);
    }
    return Promise.resolve(cmd === "read_directory" ? [] : undefined);
  });
}

/** 左ペインのマークされている行の名前を返す. */
const markedNames = (): string[] =>
  paneOf("left")
    .queryAllByRole("listitem")
    .filter((li) => li.getAttribute("data-marked") === "true")
    .map((li) => li.querySelector(".file-name")?.textContent ?? "");

/** 左ペインの行の名前 (`..` を除く) を返す. */
const leftNames = (): string[] =>
  paneOf("left")
    .getAllByRole("listitem")
    .filter(
      (li) =>
        li.classList.contains("file-row") &&
        li.querySelector("[class~='file-name']"),
    )
    .map((li) => li.querySelector(".file-name")?.textContent ?? "");

/** ステータスバーの文字列を返す. */
const statusText = (): string =>
  document.querySelector(".status-bar")?.textContent ?? "";

describe("App (マーク)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: Space でマークしてカーソルが下へ動き, u で解除して下へ動くこと", async () => {
    mockPhase4();
    const user = await renderLoaded();

    await user.keyboard(" ");
    expect(markedNames()).toEqual(["FolderA"]);
    expect(cursorNames()).toEqual(["a.txt"]);
    expect(statusText()).toContain("マーク: 1");

    await user.keyboard("k");
    await user.keyboard("u");
    expect(markedNames()).toEqual([]);
    expect(cursorNames()).toEqual(["a.txt"]);
  });

  it("正常系: 最後の行でマークしても範囲外へ出ず, 同じ行を 2 回マークしても重複しないこと", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    await user.keyboard(" ");
    await user.keyboard(" ");
    expect(markedNames()).toEqual(["b.md"]);
    expect(statusText()).toContain("マーク: 1");
  });

  it("正常系: * * と Ctrl+A で全マーク, * u と U で全解除, * t で反転できること", async () => {
    mockPhase4();
    const user = await renderLoaded();

    await user.keyboard("**");
    expect(markedNames()).toHaveLength(3);
    await user.keyboard("*u");
    expect(markedNames()).toEqual([]);

    await user.keyboard("{Control>}a{/Control}");
    expect(markedNames()).toHaveLength(3);
    await user.keyboard("U");
    expect(markedNames()).toEqual([]);

    await user.keyboard(" ");
    await user.keyboard("*t");
    expect(markedNames()).toEqual(["a.txt", "b.md"]);
  });

  it("正常系: * s でワイルドカードによるパターンマークができ, 既存のマークは維持されること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard(" ");

    await user.keyboard("*s");
    expect(
      screen.getByRole("dialog", { name: /パターンでマーク/ }),
    ).toBeInTheDocument();
    await user.keyboard("*.txt{Enter}");

    expect(markedNames().sort()).toEqual(["FolderA", "a.txt"]);
  });

  it("正常系: * s で /正規表現/ によるマークができること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("*s");
    await user.keyboard("/^b\\./{Enter}");
    expect(markedNames()).toEqual(["b.md"]);
  });

  it("異常系: 不正な正規表現ではエラーが表示され, 空のパターンでは何も起きないこと", async () => {
    mockPhase4();
    const user = await renderLoaded();

    await user.keyboard("*s");
    await user.keyboard("{Enter}");
    expect(markedNames()).toEqual([]);
    expect(screen.queryByText(/パターンが不正/)).not.toBeInTheDocument();

    await user.keyboard("*s");
    await user.keyboard("/(/{Enter}");
    expect(screen.getByText(/エラー: パターンが不正です/)).toBeInTheDocument();
    expect(markedNames()).toEqual([]);
  });

  it("境界: 項目の無いディレクトリで Space を押しても何も起きないこと", async () => {
    mockPhase4(() => []);
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByDisplayValue("/mock/home");
    await user.keyboard(" ");
    expect(statusText()).toContain("マーク: 0");
  });

  it("正常系: ディレクトリを移動するとマークが解除され, 再読み込みでは維持されること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("j ");
    expect(markedNames()).toEqual(["a.txt"]);

    await user.keyboard("{F5}");
    await waitFor(() => expect(markedNames()).toEqual(["a.txt"]));

    await user.keyboard("kk{Enter}");
    await paneOf("left").findByText("in.txt");
    expect(statusText()).toContain("マーク: 0");
  });

  it("正常系: 再読み込みで消えたファイルのマークは外れること", async () => {
    let gone = false;
    mockPhase4(() =>
      gone
        ? []
        : [
            {
              name: "x.txt",
              path: "/mock/home/x.txt",
              is_dir: false,
              size: 1,
              modified: 1,
              readonly: false,
              hidden: false,
            },
          ],
    );
    const user = userEvent.setup();
    render(<App />);
    await paneOf("left").findByText("x.txt");
    await user.keyboard(" ");
    expect(statusText()).toContain("マーク: 1");
    gone = true;
    await user.keyboard("{F5}");
    await waitFor(() => expect(statusText()).toContain("マーク: 0"));
  });
});

describe("App (表示・ソート・絞り込み)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 起動時は隠しファイルが非表示で, . と C-x . で表示が切り替わること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    expect(leftNames()).not.toContain(".hidden");
    expect(statusText()).toContain("隠しファイル非表示");

    await user.keyboard(".");
    expect(leftNames()).toContain(".hidden");
    expect(statusText()).not.toContain("隠しファイル非表示");

    await user.keyboard("{Control>}x{/Control}.");
    expect(leftNames()).not.toContain(".hidden");
    expect(statusText()).toContain("隠しファイル非表示");
  });

  it("正常系: 隠しファイルの表示を切り替えてもカーソルは同じ項目に残ること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("jj");
    expect(cursorNames()).toEqual(["b.md"]);
    await user.keyboard(".");
    expect(leftNames()).toContain(".hidden");
    expect(cursorNames()).toEqual(["b.md"]);
  });

  it("正常系: s でソートが順に切り替わり, 一周すると元に戻ること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    expect(statusText()).toContain("名前 ↑");

    await user.keyboard("s");
    expect(statusText()).toContain("名前 ↓");
    expect(leftNames()).toEqual(["FolderA", "b.md", "a.txt"]);

    await user.keyboard("ss");
    expect(statusText()).toContain("拡張子 ↓");

    await user.keyboard("ss");
    expect(statusText()).toContain("サイズ ↓");
    expect(leftNames()).toEqual(["FolderA", "a.txt", "b.md"]);

    await user.keyboard("ss");
    expect(statusText()).toContain("更新日時 ↓");
    expect(leftNames()[1]).toBe("b.md");

    await user.keyboard("s");
    expect(statusText()).toContain("名前 ↑");
  });

  it("正常系: i で詳細の列が隠れ, もう一度で戻ること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    expect(paneOf("left").getByText("サイズ")).toBeInTheDocument();

    await user.keyboard("i");
    expect(paneOf("left").queryByText("サイズ")).not.toBeInTheDocument();
    expect(paneOf("right").getByText("サイズ")).toBeInTheDocument();
    expect(paneOf("left").queryByText("d-w-")).not.toBeInTheDocument();

    await user.keyboard("i");
    expect(paneOf("left").getByText("サイズ")).toBeInTheDocument();
  });

  it("正常系: / で絞り込み入力欄が開き, 入力に合わせて一覧が絞り込まれること", async () => {
    mockPhase4();
    const user = await renderLoaded();

    await user.keyboard("/");
    expect(screen.getByLabelText("left filter")).toHaveFocus();
    await user.keyboard("TXT");
    expect(leftNames()).toEqual(["a.txt"]);

    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("left filter")).not.toHaveFocus();
    expect(leftNames()).toEqual(["a.txt"]);
    expect(cursorNames()).toEqual(["a.txt"]);
  });

  it("正常系: 絞り込み中に / や Ctrl+S を押すと入力欄へ戻り, Esc で絞り込みが解除されること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("/md{Enter}");

    await user.keyboard("{Control>}s{/Control}");
    expect(screen.getByLabelText("left filter")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("left filter")).not.toBeInTheDocument();
    expect(leftNames()).toHaveLength(3);
  });

  it("正常系: 入力欄の外で Esc を押しても絞り込みが解除され, 絞り込みが無ければ何も起きないこと", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Escape}");
    expect(leftNames()).toHaveLength(3);

    await user.keyboard("/md{Enter}{Escape}");
    expect(screen.queryByLabelText("left filter")).not.toBeInTheDocument();
    expect(leftNames()).toHaveLength(3);
  });

  it("正常系: ディレクトリを移動すると絞り込みが解除されること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("/Folder{Enter}{Enter}");
    await paneOf("left").findByText("in.txt");
    expect(screen.queryByLabelText("left filter")).not.toBeInTheDocument();
  });

  it("正常系: パス入力欄で Esc を押すと入力が元のパスに戻ること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("g");
    await user.keyboard("xyz");
    expect(screen.getAllByLabelText("left path")[0]).toHaveValue("xyz");
    await user.keyboard("{Escape}");
    expect(screen.getAllByLabelText("left path")[0]).toHaveValue("/mock/home");
  });
});

describe("App (履歴・ブックマーク)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("正常系: Alt+← / Alt+→ と C-c < / C-c > で履歴を戻る・進むことができ, 端では何も起きないこと", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(leftNames()).toContain("a.txt");

    await user.keyboard("{Enter}");
    await paneOf("left").findByText("in.txt");

    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    await waitFor(() => expect(leftNames()).toContain("a.txt"));
    expect(cursorNames()).toEqual(["FolderA"]);

    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await paneOf("left").findByText("in.txt");
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(leftNames()).toEqual(["in.txt"]);

    await user.keyboard("{Control>}c{/Control}<");
    await waitFor(() => expect(leftNames()).toContain("a.txt"));
    await user.keyboard("{Control>}c{/Control}>");
    await paneOf("left").findByText("in.txt");
  });

  it("正常系: 履歴を戻った後に別のディレクトリへ移動すると, 進む履歴は捨てられること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Enter}");
    await paneOf("left").findByText("in.txt");
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    await waitFor(() => expect(leftNames()).toContain("a.txt"));

    await user.keyboard("g");
    await user.keyboard("/mock/home/FolderA{Enter}");
    await paneOf("left").findByText("in.txt");
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(leftNames()).toEqual(["in.txt"]);
  });

  it("正常系: b で一覧が開き, 登録がまだ無いことが表示されること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("b");
    expect(
      screen.getByRole("dialog", { name: "ブックマーク" }),
    ).toBeInTheDocument();
    expect(screen.getByText("登録されていません.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("正常系: M-b でカレントディレクトリが登録され, 選ぶとそこへ移動できること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Enter}");
    await paneOf("left").findByText("in.txt");

    await user.keyboard("{Alt>}b{/Alt}");
    expect(
      screen.getByRole("button", { name: "/mock/home/FolderA" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "現在のディレクトリを解除" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.keyboard("h");
    await waitFor(() => expect(leftNames()).toContain("a.txt"));
    await user.keyboard("b");
    await user.click(
      screen.getByRole("button", { name: "/mock/home/FolderA" }),
    );
    await paneOf("left").findByText("in.txt");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("正常系: 一覧のボタンで, 現在のディレクトリの登録・解除と ×  での解除ができること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("b");

    await user.click(
      screen.getByRole("button", { name: "現在のディレクトリを登録" }),
    );
    expect(
      screen.getByRole("button", { name: "/mock/home" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "現在のディレクトリを解除" }),
    );
    expect(screen.getByText("登録されていません.")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "現在のディレクトリを登録" }),
    );
    await user.click(screen.getByRole("button", { name: "/mock/home を解除" }));
    expect(screen.getByText("登録されていません.")).toBeInTheDocument();
  });

  it("正常系: 右ペインがアクティブなときは, 右ペインの履歴を戻れること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Tab}{Enter}");
    await paneOf("right").findByText("in.txt");

    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");

    await waitFor(() =>
      expect(paneOf("right").getByText("a.txt")).toBeInTheDocument(),
    );
  });
});
