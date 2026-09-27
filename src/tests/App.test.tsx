import {
  act,
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
  Channel: class {
    onmessage?: (message: unknown) => void;
  },
}));

const mockedInvoke = vi.mocked(invoke);

/** 指定したペインの親ディレクトリの行 (`..`) を返す. */
const parentRow = (pane: "left" | "right"): HTMLElement =>
  within(screen.getByRole("region", { name: `${pane} pane` }))
    .getByText("..")
    .closest("li") as HTMLElement;

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

/** モックで, 個別に扱わなかったコマンドの既定の戻り値を返す. */
function defaultResult(cmd: string): unknown {
  if (
    cmd === "read_directory" ||
    cmd === "check_conflicts" ||
    cmd === "complete_path"
  )
    return [];
  if (cmd === "load_keymap") return {};
  if (cmd === "run_transfer") return { processed: 1, cancelled: false };
  return undefined;
}

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
    return Promise.resolve(defaultResult(cmd));
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
    expect(cursorNames()).toEqual([""]);
    expect(parentRow("left")).toHaveAttribute("aria-current", "true");
    await user.keyboard("{ArrowUp}");
    expect(parentRow("left")).toHaveAttribute("aria-current", "true");
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

  it("正常系: ミニバッファ内をクリックしても閉じないこと", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("N");
    await user.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
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
      expect(mockedInvoke).toHaveBeenCalledWith("run_transfer", {
        request: {
          kind: "delete",
          sources: ["/mock/home/b.txt"],
          dest_dir: null,
          overwrite: false,
          permanent: false,
        },
        onProgress: expect.anything(),
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
      "run_transfer",
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
      expect(mockedInvoke).toHaveBeenCalledWith("run_transfer", {
        request: {
          kind: "delete",
          sources: ["/mock/home/FolderA"],
          dest_dir: null,
          overwrite: false,
          permanent: true,
        },
        onProgress: expect.anything(),
      }),
    );
  });

  it("異常系: 削除に失敗するとエラーが表示されること", async () => {
    mockHome((cmd) =>
      cmd === "run_transfer" ? Promise.reject("削除できません") : undefined,
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
    // ディスク容量の取得が終わってから, 呼び出しの記録を消す.
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("get_disk_space", {
        path: "/mock/home",
      }),
    );
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
      expect(mockedInvoke).toHaveBeenCalledWith("run_transfer", {
        request: {
          kind: "copy",
          sources: ["/mock/home/b.txt"],
          dest_dir: "/mock/home/FolderA",
          overwrite: false,
          permanent: false,
        },
        onProgress: expect.anything(),
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
      cmd === "run_transfer" ? Promise.reject("コピーできません") : undefined,
    );
    const user = await renderLoaded();
    await user.keyboard("{Tab}{Enter}");
    await paneOf("right").findByText("in.txt");
    await user.keyboard("{Tab}c");
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
    await user.keyboard("{Enter}");
    await paneOf("left").findByText("in.txt");
    await user.keyboard("{Tab}j");

    await user.keyboard("c");

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("run_transfer", {
        request: {
          kind: "copy",
          sources: ["/mock/home/b.txt"],
          dest_dir: "/mock/home/FolderA",
          overwrite: false,
          permanent: false,
        },
        onProgress: expect.anything(),
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
    return Promise.resolve(defaultResult(cmd));
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

  it("正常系: b でアクティブなペインの表示がブックマーク一覧に切り替わり, 登録がまだ無いことが表示されること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("b");
    expect(paneOf("left").getByText("登録されていません.")).toBeInTheDocument();
    expect(paneOf("right").getByText("FolderA")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(paneOf("left").getByText("FolderA")).toBeInTheDocument();
  });

  it("正常系: M-b でカレントディレクトリが登録され, Enter で選んだ先へ移動して通常表示へ戻ること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Enter}");
    await paneOf("left").findByText("in.txt");

    await user.keyboard("{Alt>}b{/Alt}");
    expect(paneOf("left").getByText("/mock/home/FolderA")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.keyboard("h");
    await waitFor(() => expect(leftNames()).toContain("a.txt"));
    await user.keyboard("b");
    await user.keyboard("{Enter}");

    await paneOf("left").findByText("in.txt");
  });

  it("正常系: ダブルクリックでもそのディレクトリへ移動して通常表示へ戻ること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}b{/Alt}");
    await user.dblClick(paneOf("left").getByText("/mock/home"));
    await waitFor(() => expect(leftNames()).toContain("a.txt"));
  });

  it("正常系: 右ペインで開くと右ペインに表示され, もう一方の左ペインは通常のまま操作できること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Tab}");
    await user.keyboard("{Alt>}b{/Alt}");
    expect(paneOf("right").getByText("/mock/home")).toBeInTheDocument();
    expect(paneOf("left").getByText("FolderA")).toBeInTheDocument();

    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(paneOf("right").getByText("FolderA")).toBeInTheDocument(),
    );
    expect(paneOf("left").getByText("FolderA")).toBeInTheDocument();
  });

  it("正常系: j/k でカーソルが動き, d でカーソル位置のブックマークを解除できること (一覧にはとどまる)", async () => {
    mockPhase4();
    const user = await renderLoaded();

    await user.keyboard("{Alt>}b{/Alt}");
    await user.keyboard("{Escape}");
    await user.keyboard("{Enter}");
    await paneOf("left").findByText("in.txt");
    await user.keyboard("{Alt>}b{/Alt}");

    expect(
      paneOf("left")
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["/mock/home", "/mock/home/FolderA"]);

    await user.keyboard("j");
    await user.keyboard("d");
    expect(paneOf("left").getByText("/mock/home")).toBeInTheDocument();
    expect(
      paneOf("left").queryByText("/mock/home/FolderA"),
    ).not.toBeInTheDocument();

    await user.keyboard("u");
    expect(paneOf("left").getByText("登録されていません.")).toBeInTheDocument();
  });

  it("境界: 先頭の行で ↑ を押してもカーソルが範囲外へ出ないこと", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}b{/Alt}");
    await user.keyboard("{ArrowUp}");
    expect(
      paneOf("left").getByText("/mock/home").closest("li"),
    ).toHaveAttribute("aria-current", "true");
  });

  it("正常系: Delete キーでもカーソル位置のブックマークを解除できること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}b{/Alt}");
    await user.keyboard("{Delete}");
    expect(paneOf("left").getByText("登録されていません.")).toBeInTheDocument();
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

/** 左ペインを /mock/home, 右ペインを /mock/home/FolderA にして, 左をアクティブにした状態にする. */
async function renderTwoDirs(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = await renderLoaded();
  await user.keyboard("{Tab}{Enter}");
  await paneOf("right").findByText("in.txt");
  await user.keyboard("{Tab}");
  return user;
}

/** 進捗の通知と完了を, テストから制御できる run_transfer のモックを設定する. */
function mockControlledTransfer(
  extra: (cmd: string) => Promise<unknown> | undefined = () => undefined,
): {
  emit: (progress: unknown) => void;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
} {
  let channel: { onmessage?: (m: unknown) => void } = {};
  let resolve: (value: unknown) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  mockHome((cmd, args) => {
    const handled = extra(cmd);
    if (handled) return handled;
    if (cmd === "run_transfer") {
      channel = (args as { onProgress: typeof channel }).onProgress;
      return new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
    }
    return undefined;
  });
  return {
    emit: (progress) => channel.onmessage?.(progress),
    resolve: (value) => resolve(value),
    reject: (reason) => reject(reason),
  };
}

describe("App (コピー・移動・削除の実行)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: m で移動でき, 完了の通知が表示されること", async () => {
    mockHome();
    const user = await renderTwoDirs();
    await user.keyboard("j");

    await user.keyboard("m");

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("run_transfer", {
        request: {
          kind: "move",
          sources: ["/mock/home/b.txt"],
          dest_dir: "/mock/home/FolderA",
          overwrite: false,
          permanent: false,
        },
        onProgress: expect.anything(),
      }),
    );
    expect(await screen.findByText("移動しました: 1 件")).toBeInTheDocument();
  });

  it("正常系: c の完了で通知が表示され, 両ペインが再読み込みされること", async () => {
    mockHome();
    const user = await renderTwoDirs();
    mockedInvoke.mockClear();

    await user.keyboard("c");

    expect(await screen.findByText("コピーしました: 1 件")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("read_directory", {
      path: "/mock/home",
    });
    expect(mockedInvoke).toHaveBeenCalledWith("read_directory", {
      path: "/mock/home/FolderA",
    });
  });

  it("異常系: 対向ペインが同じディレクトリのときは, コピー・移動せずエラーが表示されること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("m");
    expect(
      screen.getByText(/対向ペインが同じディレクトリです/),
    ).toBeInTheDocument();
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "run_transfer",
      expect.anything(),
    );
  });

  it("正常系: マークした複数の項目がまとめてコピーされ, 完了後にマークが解除されること", async () => {
    mockHome();
    const user = await renderTwoDirs();
    await user.keyboard("  ");
    expect(statusText()).toContain("マーク: 2");

    await user.keyboard("c");

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("run_transfer", {
        request: expect.objectContaining({
          kind: "copy",
          sources: ["/mock/home/FolderA", "/mock/home/b.txt"],
        }),
        onProgress: expect.anything(),
      }),
    );
    await waitFor(() => expect(statusText()).toContain("マーク: 0"));
  });

  it("正常系: 同名のものがある場合は上書きを確認し, y で上書きして実行されること", async () => {
    mockHome((cmd) =>
      cmd === "check_conflicts" ? Promise.resolve(["b.txt"]) : undefined,
    );
    const user = await renderTwoDirs();
    await user.keyboard("j");

    await user.keyboard("c");
    expect(
      screen.getByText(
        "1 件が既に存在します (b.txt). 上書きしてコピーしますか? (y/n)",
      ),
    ).toBeInTheDocument();
    await user.keyboard("y");

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("run_transfer", {
        request: expect.objectContaining({ kind: "copy", overwrite: true }),
        onProgress: expect.anything(),
      }),
    );
  });

  it("正常系: 上書きの確認で n を押すと実行されず, 4 件以上の同名は省略して表示されること", async () => {
    mockHome((cmd) =>
      cmd === "check_conflicts"
        ? Promise.resolve(["a", "b", "c", "d"])
        : undefined,
    );
    const user = await renderTwoDirs();

    await user.keyboard("m");
    expect(
      screen.getByText(
        "4 件が既に存在します (a, b, c ほか). 上書きして移動しますか? (y/n)",
      ),
    ).toBeInTheDocument();
    await user.keyboard("n");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "run_transfer",
      expect.anything(),
    );
  });

  it("正常系: C と M は, 同名が無くても実行前に確認すること", async () => {
    mockHome();
    const user = await renderTwoDirs();

    await user.keyboard("C");
    expect(
      screen.getByText("1 件を「/mock/home/FolderA」へコピーしますか? (y/n)"),
    ).toBeInTheDocument();
    await user.keyboard("n");
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "run_transfer",
      expect.anything(),
    );

    await user.keyboard("M");
    expect(screen.getByRole("dialog", { name: "移動" })).toBeInTheDocument();
    await user.keyboard("y");
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("run_transfer", {
        request: expect.objectContaining({ kind: "move", overwrite: false }),
        onProgress: expect.anything(),
      }),
    );
  });

  it("異常系: 同名の確認に失敗するとエラーが表示され, 実行されないこと", async () => {
    mockHome((cmd) =>
      cmd === "check_conflicts" ? Promise.reject("確認できません") : undefined,
    );
    const user = await renderTwoDirs();
    await user.keyboard("c");
    expect(
      await screen.findByText("エラー: 確認できません"),
    ).toBeInTheDocument();
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "run_transfer",
      expect.anything(),
    );
  });

  it("正常系: マークした複数の項目の削除は, 件数で確認されること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("  d");
    expect(
      screen.getByText("2 件をゴミ箱へ移動しますか? (y/n)"),
    ).toBeInTheDocument();
    await user.keyboard("D");
    await user.keyboard("{Escape}D");
    expect(
      screen.getByText("2 件を完全に削除しますか? 元に戻せません. (y/n)"),
    ).toBeInTheDocument();
  });

  it("正常系: 実行中は進捗ダイアログが表示され, 進捗が反映され, 他のキー操作は効かないこと", async () => {
    const transfer = mockControlledTransfer();
    const user = await renderTwoDirs();
    await user.keyboard("j");

    await user.keyboard("c");
    const dialog = await screen.findByRole("dialog", { name: "コピー中" });
    expect(within(dialog).getByText("準備中...")).toBeInTheDocument();

    act(() => transfer.emit({ done: 5, total: 10, current: "b.txt" }));
    expect(within(dialog).getByText("b.txt")).toBeInTheDocument();
    const bar = within(dialog).getByRole("progressbar");
    expect(bar).toHaveAttribute("value", "5");
    expect(bar).toHaveAttribute("max", "10");

    await user.keyboard("k");
    expect(cursorNames()).toEqual(["b.txt"]);

    await act(async () => transfer.resolve({ processed: 1, cancelled: false }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("コピーしました: 1 件")).toBeInTheDocument();

    act(() => transfer.emit({ done: 9, total: 10, current: "late" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    [
      "中断ボタン",
      async (u: ReturnType<typeof userEvent.setup>) => {
        await u.click(screen.getByRole("button", { name: "中断 (C-g)" }));
      },
    ],
    [
      "C-g",
      async (u: ReturnType<typeof userEvent.setup>) => {
        await u.keyboard("{Control>}g{/Control}");
      },
    ],
    [
      "Esc",
      async (u: ReturnType<typeof userEvent.setup>) => {
        await u.keyboard("{Escape}");
      },
    ],
  ])(
    "正常系: %s で中断でき, 中断した旨が通知されること",
    async (_name, cancel) => {
      const transfer = mockControlledTransfer();
      const user = await renderTwoDirs();
      await user.keyboard("j");
      await user.keyboard("m");
      await screen.findByRole("dialog", { name: "移動中" });

      await cancel(user);

      expect(mockedInvoke).toHaveBeenCalledWith("cancel_transfer");
      expect(
        screen.getByRole("button", { name: "中断しています..." }),
      ).toBeDisabled();

      await act(async () =>
        transfer.resolve({ processed: 0, cancelled: true }),
      );
      expect(
        await screen.findByText("移動を中断しました (0/1 件処理済み)"),
      ).toBeInTheDocument();
    },
  );

  it("異常系: 中断の要求に失敗しても, 操作は続き画面は動作すること", async () => {
    const transfer = mockControlledTransfer((cmd) =>
      cmd === "cancel_transfer" ? Promise.reject("失敗") : undefined,
    );
    const user = await renderTwoDirs();
    await user.keyboard("jdy");
    await screen.findByRole("dialog", { name: "削除中" });

    await user.click(screen.getByRole("button", { name: "中断 (C-g)" }));
    await act(async () => transfer.resolve({ processed: 1, cancelled: false }));

    expect(await screen.findByText("削除しました: 1 件")).toBeInTheDocument();
  });

  it("異常系: 実行中に失敗すると, 進捗ダイアログが閉じてエラーが表示されること", async () => {
    const transfer = mockControlledTransfer();
    const user = await renderTwoDirs();
    await user.keyboard("c");
    await screen.findByRole("dialog", { name: "コピー中" });

    await act(async () => transfer.reject("ディスクがいっぱいです"));

    expect(
      await screen.findByText("エラー: ディスクがいっぱいです"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("正常系: O と C-x 4 で, 反対側のペインがアクティブなペインと同じディレクトリになること", async () => {
    mockHome();
    const user = await renderTwoDirs();
    expect(paneOf("right").queryByText("FolderA")).not.toBeInTheDocument();

    await user.keyboard("O");
    await waitFor(() =>
      expect(paneOf("right").getByText("FolderA")).toBeInTheDocument(),
    );

    await user.keyboard("{Tab}{Enter}");
    await paneOf("right").findByText("in.txt");
    await user.keyboard("{Control>}x{/Control}4");
    await waitFor(() =>
      expect(paneOf("left").getByText("in.txt")).toBeInTheDocument(),
    );
  });
});

describe("App (操作ログ)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: H でログのダイアログが開き, ログが無ければその旨が表示され, Esc で閉じること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("H");
    expect(
      screen.getByRole("dialog", { name: "操作ログ" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ログはありません.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("正常系: 完了の通知とエラーが, 新しいものを上にして記録されること", async () => {
    mockHome((cmd) =>
      cmd === "create_directory" ? Promise.reject("作成できません") : undefined,
    );
    const user = await renderTwoDirs();
    await user.keyboard("c");
    await screen.findByText("コピーしました: 1 件");
    await user.keyboard("Nx{Enter}");
    await screen.findByText("エラー: 作成できません");

    await user.keyboard("H");
    const items = within(screen.getByRole("dialog")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("作成できません");
    expect(items[0]).toHaveAttribute("data-level", "error");
    expect(items[1]).toHaveTextContent("コピーしました: 1 件");
    expect(items[1]).toHaveAttribute("data-level", "info");
    expect(items[1].textContent).toMatch(/^\d{2}:\d{2}:\d{2} /);

    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("正常系: ディレクトリの読み込みエラーも記録されること", async () => {
    mockedInvoke.mockImplementation((cmd) =>
      cmd === "get_home_dir"
        ? Promise.resolve("/mock/home")
        : Promise.reject("読めません"),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByText("エラー: 読めません");
    await user.keyboard("H");
    expect(
      within(screen.getByRole("dialog")).getAllByText(/読めません/).length,
    ).toBeGreaterThan(0);
  });
});

/** 指定した名前が左ペインに表示されるまで待って, App を描画する. */
async function renderLoadedFor(
  name: string,
): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  render(<App />);
  await paneOf("left").findByText(name);
  return user;
}

/** プレビュー用のファイルを持つホームと, パスごとのプレビューの戻り値を設定する. */
function mockPreviewHome(
  previews: Record<string, unknown | Error>,
  delay?: Promise<void>,
): void {
  const file = (name: string, over: Record<string, unknown> = {}) => ({
    name,
    path: `/mock/home/${name}`,
    is_dir: false,
    size: 10,
    modified: 1000,
    readonly: false,
    hidden: false,
    ...over,
  });
  mockedInvoke.mockImplementation(async (cmd, args) => {
    if (cmd === "get_home_dir") return "/mock/home";
    if (cmd === "read_directory") {
      return pathOf(args) === "/mock/home"
        ? [
            file("Dir", { is_dir: true }),
            file("a.ts"),
            file("b.png"),
            file("c.bin"),
            file("d.txt"),
            file("e.txt"),
          ]
        : [];
    }
    if (cmd === "read_preview") {
      await delay;
      const result = previews[pathOf(args) as string];
      if (result instanceof Error) throw result.message;
      return result;
    }
    return defaultResult(cmd);
  });
}

/** テキストのプレビューを作る. */
const textPreview = (text: string, over: Record<string, unknown> = {}) => ({
  kind: "text",
  size: 12,
  encoding: "UTF-8",
  text,
  data_url: null,
  truncated: false,
  ...over,
});

describe("App (プレビュー)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: v で反対側のペインの場所にプレビューが開き, ディレクトリでは対象が無い旨が表示され, もう一度 v で閉じること", async () => {
    mockPreviewHome({});
    const user = await renderLoadedFor("Dir");
    expect(screen.queryByRole("region", { name: "preview pane" })).toBeNull();

    await user.keyboard("v");
    const preview = screen.getByRole("region", { name: "preview pane" });
    expect(
      within(preview).getByText("プレビューできる項目がありません."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "right pane" })).toBeNull();
    expect(
      screen.getByRole("region", { name: "left pane" }),
    ).toBeInTheDocument();
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "read_preview",
      expect.anything(),
    );

    await user.keyboard("v");
    expect(screen.queryByRole("region", { name: "preview pane" })).toBeNull();
    expect(
      screen.getByRole("region", { name: "right pane" }),
    ).toBeInTheDocument();
  });

  it("正常系: テキストはシンタックスハイライトされ, 文字コードとサイズが表示されること", async () => {
    mockPreviewHome({
      "/mock/home/a.ts": textPreview("const a = 1; <b>", { truncated: true }),
    });
    const user = await renderLoadedFor("Dir");

    await user.keyboard("jv");

    const preview = screen.getByRole("region", { name: "preview pane" });
    expect(await within(preview).findByText("const")).toHaveClass(
      "hljs-keyword",
    );
    expect(preview).toHaveTextContent("const a = 1; <b>");
    expect(preview).toHaveTextContent("UTF-8 / 12B / 先頭のみ");
    expect(preview.querySelector("b")).toBeNull();
  });

  it("正常系: 対応する言語が無い拡張子は, そのままのテキストで表示されること", async () => {
    mockPreviewHome({ "/mock/home/d.txt": textPreview("plain <text>") });
    const user = await renderLoadedFor("Dir");
    await user.keyboard("jjjjv");
    const preview = screen.getByRole("region", { name: "preview pane" });
    expect(
      await within(preview).findByText("plain <text>"),
    ).toBeInTheDocument();
    expect(preview.querySelector(".hljs-keyword")).toBeNull();
  });

  it("正常系: 画像とバイナリがそれぞれの形式で表示されること", async () => {
    mockPreviewHome({
      "/mock/home/b.png": {
        kind: "image",
        size: 3,
        encoding: null,
        text: null,
        data_url: "data:image/png;base64,AQID",
        truncated: false,
      },
      "/mock/home/c.bin": {
        kind: "binary",
        size: 4,
        encoding: null,
        text: "00000000  41 42 00 01",
        data_url: null,
        truncated: false,
      },
    });
    const user = await renderLoadedFor("Dir");

    await user.keyboard("jjv");
    const preview = screen.getByRole("region", { name: "preview pane" });
    const image = await within(preview).findByRole("img", { name: "b.png" });
    expect(image).toHaveAttribute("src", "data:image/png;base64,AQID");

    await user.keyboard("j");
    expect(
      await within(preview).findByText("00000000 41 42 00 01", {
        normalizer: (t) => t.replace(/\s+/g, " "),
      }),
    ).toBeInTheDocument();
  });

  it("異常系: プレビューに失敗した場合は, そのメッセージが表示されること", async () => {
    mockPreviewHome({ "/mock/home/a.ts": new Error("大きすぎます") });
    const user = await renderLoadedFor("Dir");
    await user.keyboard("jv");
    expect(
      await within(
        screen.getByRole("region", { name: "preview pane" }),
      ).findByText("大きすぎます"),
    ).toBeInTheDocument();
  });

  it("正常系: 読み込み中は読み込み中と表示され, Tab でペインを切り替えるとプレビューの場所が入れ替わること", async () => {
    let release: () => void = () => {};
    const delay = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockPreviewHome({ "/mock/home/a.ts": textPreview("x") }, delay);
    const user = await renderLoadedFor("Dir");

    await user.keyboard("jv");
    const preview = screen.getByRole("region", { name: "preview pane" });
    expect(within(preview).getByText("読み込み中...")).toBeInTheDocument();
    await act(async () => release());
    expect(await within(preview).findByText("x")).toBeInTheDocument();

    await user.keyboard("{Tab}");
    expect(screen.queryByRole("region", { name: "right pane" })).not.toBeNull();
    expect(screen.queryByRole("region", { name: "left pane" })).toBeNull();
    expect(
      screen.getByRole("region", { name: "preview pane" }),
    ).toBeInTheDocument();
  });

  it("正常系: カーソルを動かすとプレビューが切り替わること", async () => {
    mockPreviewHome({
      "/mock/home/d.txt": textPreview("first"),
      "/mock/home/e.txt": textPreview("second"),
    });
    const user = await renderLoadedFor("Dir");
    await user.keyboard("jjjjv");
    const preview = screen.getByRole("region", { name: "preview pane" });
    expect(await within(preview).findByText("first")).toBeInTheDocument();

    await user.keyboard("j");
    expect(await within(preview).findByText("second")).toBeInTheDocument();
    expect(within(preview).queryByText("first")).toBeNull();
  });

  it("境界: 項目の無いディレクトリでもプレビューを開け, 対象が無い旨が表示されること", async () => {
    mockedInvoke.mockImplementation((cmd) =>
      cmd === "get_home_dir" ? Promise.resolve("/empty") : Promise.resolve([]),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByDisplayValue("/empty");

    await user.keyboard("v");

    expect(
      within(screen.getByRole("region", { name: "preview pane" })).getByText(
        "プレビューできる項目がありません.",
      ),
    ).toBeInTheDocument();
  });

  it("正常系: k で先頭の上の .. の行にカーソルが移り, Enter で親ディレクトリへ移動し, 元のディレクトリにカーソルが合うこと", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") return Promise.resolve("/mock/home");
      if (cmd === "read_directory" && pathOf(args) === "/mock") {
        return Promise.resolve([
          { name: "other", path: "/mock/other", is_dir: true },
          { name: "home", path: "/mock/home", is_dir: true },
        ]);
      }
      return Promise.resolve(defaultResult(cmd as string));
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByDisplayValue("/mock/home");

    await user.keyboard("k");
    expect(parentRow("left")).toHaveAttribute("aria-current", "true");
    expect(statusText()).toContain("..");

    await user.keyboard("{Enter}");
    await paneOf("left").findByText("other");
    expect(cursorNames()).toEqual(["home"]);
  });

  it("正常系: .. の行では Space・名前変更・コピーは対象なしとして扱われ, j で先頭へ戻れること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("k ");
    expect(statusText()).toContain("マーク: 0");
    expect(cursorNames()).toEqual(["FolderA"]);

    await user.keyboard("kr");
    expect(
      screen.getByText("エラー: 対象の項目が選択されていません."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.keyboard("j");
    expect(cursorNames()).toEqual(["FolderA"]);
  });

  it("正常系: .. の行をクリックするとカーソルが移り, 再読み込みしても .. の行に残ること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.click(paneOf("right").getByText(".."));
    expect(parentRow("right")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: "right pane" })).toHaveAttribute(
      "data-active",
      "true",
    );

    await user.keyboard("{F5}");
    await waitFor(() =>
      expect(parentRow("right")).toHaveAttribute("aria-current", "true"),
    );
    expect(parentRow("left")).toHaveAttribute("data-cursor", "none");

    await user.click(paneOf("left").getByText(".."));
    expect(parentRow("right")).toHaveAttribute("data-cursor", "inactive");
  });

  it("境界: ルートでは .. の行が無いので, k で先頭より上へは動かないこと", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") return Promise.resolve("/");
      if (cmd === "read_directory" && pathOf(args) === "/") {
        return Promise.resolve([{ name: "usr", path: "/usr", is_dir: true }]);
      }
      return Promise.resolve(defaultResult(cmd as string));
    });
    const user = userEvent.setup();
    render(<App />);
    await paneOf("left").findByText("usr");
    await user.keyboard("kk");
    expect(cursorNames()).toEqual(["usr"]);
  });
});

describe("App (ページ送り・先頭末尾・パス補完・パレット・終了)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** 6 件のファイルを持つホームを設定する. */
  function mockManyFiles(): void {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") return Promise.resolve("/mock/home");
      if (cmd === "read_directory" && pathOf(args) === "/mock/home") {
        return Promise.resolve(
          Array.from({ length: 6 }, (_, i) => ({
            name: `f${i}.txt`,
            path: `/mock/home/f${i}.txt`,
            is_dir: false,
            size: 1,
            modified: 1,
            readonly: false,
            hidden: false,
          })),
        );
      }
      return Promise.resolve(defaultResult(cmd as string));
    });
  }

  it("正常系: PageUp/PageDown と C-v/M-v で 10 行ずつ動き, 範囲外に出ないこと", async () => {
    mockManyFiles();
    const user = userEvent.setup();
    render(<App />);
    await paneOf("left").findByText("f0.txt");
    expect(cursorNames()).toEqual(["f0.txt"]);

    await user.keyboard("{PageDown}");
    expect(cursorNames()).toEqual(["f5.txt"]);

    await user.keyboard("{PageUp}");
    expect(cursorNames()).toEqual([""]);

    await user.keyboard("{Control>}v{/Control}");
    expect(cursorNames()).toEqual(["f5.txt"]);
    await user.keyboard("{Alt>}v{/Alt}");
    expect(cursorNames()).toEqual([""]);
  });

  it("正常系: Home/End と M-</M-> で先頭・末尾に動くこと", async () => {
    mockManyFiles();
    const user = userEvent.setup();
    render(<App />);
    await paneOf("left").findByText("f0.txt");
    await user.keyboard("j");
    expect(cursorNames()).toEqual(["f1.txt"]);

    await user.keyboard("{End}");
    expect(cursorNames()).toEqual(["f5.txt"]);
    await user.keyboard("{Home}");
    expect(cursorNames()).toEqual([""]);

    await user.keyboard("{Alt>}>{/Alt}");
    expect(cursorNames()).toEqual(["f5.txt"]);
    await user.keyboard("{Alt>}<{/Alt}");
    expect(cursorNames()).toEqual([""]);
  });

  it("正常系: g でパス入力欄へ移り, Tab でディレクトリを補完できること", async () => {
    mockHome((cmd, args) => {
      if (cmd === "complete_path" && pathOf(args) === undefined)
        return undefined;
      return undefined;
    });
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") return Promise.resolve("/mock/home");
      if (cmd === "read_directory" && pathOf(args) === "/mock/home") {
        return Promise.resolve([
          { name: "FolderA", path: "/mock/home/FolderA", is_dir: true },
        ]);
      }
      if (cmd === "complete_path") {
        const input = (args as { input: string }).input;
        return Promise.resolve(
          input === "/mock/home/Fol" ? ["/mock/home/FolderA/"] : [],
        );
      }
      return Promise.resolve(defaultResult(cmd as string));
    });
    const user = await renderLoaded();

    await user.keyboard("g");
    await user.keyboard("/mock/home/Fol");
    await user.keyboard("{Tab}");

    await waitFor(() =>
      expect(screen.getAllByLabelText("left path")[0]).toHaveValue(
        "/mock/home/FolderA/",
      ),
    );
  });

  it("異常系: パス補完に候補が無ければ, 入力はそのままであること", async () => {
    mockHome((cmd) =>
      cmd === "complete_path" ? Promise.resolve([]) : undefined,
    );
    const user = await renderLoaded();
    await user.keyboard("g");
    await user.keyboard("zzz");
    await user.keyboard("{Tab}");
    expect(screen.getAllByLabelText("left path")[0]).toHaveValue("zzz");
  });

  it("正常系: M-x でパレットが開き, コマンド名を入力して実行できること (候補の一覧は表示しない)", async () => {
    mockHome();
    const user = await renderLoaded();

    await user.keyboard("{Alt>}x{/Alt}");
    expect(
      screen.getByRole("dialog", { name: "コマンドの実行" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "toggleHidden" })).toBeNull();

    expect(statusText()).toContain("隠しファイル非表示");

    await user.keyboard("toggleHidden{Enter}");
    expect(statusText()).not.toContain("隠しファイル非表示");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("正常系: 入力して Enter で, 一意に決まる名前が実行されること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}x{/Alt}");
    await user.keyboard("cursorDo{Enter}");
    expect(cursorNames()).toEqual(["b.txt"]);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("正常系: Tab で共通の先頭部分まで補完され, 候補が複数のままなら実行されないこと", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}x{/Alt}");
    await user.keyboard("cursor");
    await user.keyboard("{Tab}");
    await user.keyboard("{Enter}");
    expect(screen.getByText(/件が一致しています/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("正常系: Tab で入力が, 共通の先頭部分まで伸びること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}x{/Alt}");
    await user.keyboard("curs");
    await user.keyboard("{Tab}");
    expect(screen.getByLabelText("コマンド名")).toHaveValue("cursor");
  });

  it("異常系: 一致しない名前で Enter を押すと, その旨が表示されること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}x{/Alt}");
    await user.keyboard("no-such-command{Enter}");
    expect(
      screen.getByText("該当するコマンドがありません."),
    ).toBeInTheDocument();
  });

  it("正常系: パレット内で ↑/↓ と M-p/M-n により, 実行した名前の履歴をたどれること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}x{/Alt}");
    await user.keyboard("toggleHidden{Enter}");

    await user.keyboard("{Alt>}x{/Alt}");
    await user.keyboard("cycleSort{Enter}");

    await user.keyboard("{Alt>}x{/Alt}");
    const input = screen.getByLabelText("コマンド名");
    await user.type(input, "{ArrowUp}");
    expect(input).toHaveValue("cycleSort");
    await user.type(input, "{ArrowUp}");
    expect(input).toHaveValue("toggleHidden");
    await user.type(input, "{ArrowDown}");
    expect(input).toHaveValue("cycleSort");
    await user.type(input, "{Alt>}n{/Alt}");
    expect(input).toHaveValue("");
  });

  it("境界: 実行履歴が無い状態でパレットの履歴キーを押しても, 何も起きないこと", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}x{/Alt}");
    const input = screen.getByLabelText("コマンド名");
    await user.type(input, "{Alt>}p{/Alt}");
    expect(input).toHaveValue("");
  });

  it("正常系: パレットは Esc で閉じられ, 開いている間は他のキー操作が効かないこと", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}x{/Alt}");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.keyboard("{Alt>}x{/Alt}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("正常系: q または C-x C-c で終了が呼ばれること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("q");
    expect(mockedInvoke).toHaveBeenCalledWith("quit_app");

    mockedInvoke.mockClear();
    await user.keyboard("{Control>}x{/Control}{Control>}c{/Control}");
    expect(mockedInvoke).toHaveBeenCalledWith("quit_app");
  });

  it("異常系: 終了の要求に失敗しても, 画面は動作を続けること", async () => {
    mockHome((cmd) =>
      cmd === "quit_app" ? Promise.reject("失敗") : undefined,
    );
    const user = await renderLoaded();
    await user.keyboard("q");
    await user.keyboard("j");
    expect(cursorNames()).toEqual(["b.txt"]);
  });

  it("正常系: 入力途中のキーの並びが, ステータスバーに表示されること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Control>}x{/Control}");
    expect(statusText()).toContain("[C-x-]");
    await user.keyboard(".");
    expect(statusText()).not.toContain("[C-x-]");
  });

  it("異常系: ユーザーのキーマップ設定が不正な場合, 操作ログに警告が記録されること", async () => {
    mockHome((cmd) =>
      cmd === "load_keymap"
        ? Promise.resolve({ "X-k": "cursorDown" })
        : undefined,
    );
    const user = await renderLoaded();
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("load_keymap"),
    );
    await user.keyboard("H");
    expect(
      within(screen.getByRole("dialog")).getByText(/キーの表記が不正です/),
    ).toBeInTheDocument();
  });

  it("正常系: ユーザーのキーマップ設定で, 割り当てを上書きできること", async () => {
    mockHome((cmd) =>
      cmd === "load_keymap"
        ? Promise.resolve({ "C-j": "cursorDown" })
        : undefined,
    );
    const user = await renderLoaded();
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("load_keymap"),
    );
    await user.keyboard("{Control>}j{/Control}");
    expect(cursorNames()).toEqual(["b.txt"]);
  });

  it("異常系: パレットで, 一致するがコマンドとして解決できない (通常は起きない) 場合はエラーになること", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}x{/Alt}");
    await user.keyboard("refresh{Enter}");
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("read_directory", {
        path: "/mock/home",
      }),
    );
  });

  it("異常系: パス補完の取得に失敗しても, 入力はそのままであること", async () => {
    mockHome((cmd) =>
      cmd === "complete_path" ? Promise.reject("補完できません") : undefined,
    );
    const user = await renderLoaded();
    await user.keyboard("g");
    await user.keyboard("zzz");
    await user.keyboard("{Tab}");
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("complete_path", {
        input: "zzz",
      }),
    );
    expect(screen.getAllByLabelText("left path")[0]).toHaveValue("zzz");
  });

  it("境界: パレットで Tab を押しても, 補完で入力が伸びない場合は変わらないこと", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}x{/Alt}");
    await user.keyboard("cursorDown");
    await user.keyboard("{Tab}");
    expect(screen.getByLabelText("コマンド名")).toHaveValue("cursorDown");
  });
});

describe("App (ヘルプ)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: ? でコマンド一覧が開き, キーと説明が表示され, 閉じるボタンで閉じること", async () => {
    mockHome();
    const user = await renderLoaded();

    await user.keyboard("?");
    const dialog = screen.getByRole("dialog", { name: "コマンド一覧" });
    expect(within(dialog).getByText("cursorDown")).toBeInTheDocument();
    expect(within(dialog).getByText(/Down.*C-n.*j/)).toBeInTheDocument();
    expect(within(dialog).getByText("カーソルを下へ")).toBeInTheDocument();
    expect(within(dialog).getByText(/refresh→reload/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("正常系: : でパレットが開き, help と入力して実行するとコマンド一覧が開くこと", async () => {
    mockHome();
    const user = await renderLoaded();

    await user.keyboard(":");
    expect(
      screen.getByRole("dialog", { name: "コマンドの実行" }),
    ).toBeInTheDocument();
    await user.keyboard("help{Enter}");

    expect(
      screen.getByRole("dialog", { name: "コマンド一覧" }),
    ).toBeInTheDocument();
  });

  it("正常系: ユーザーのキーマップ設定で上書きされた割り当ても, 一覧に反映されること", async () => {
    mockHome((cmd) =>
      cmd === "load_keymap"
        ? Promise.resolve({ "C-j": "cursorDown" })
        : undefined,
    );
    const user = await renderLoaded();
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("load_keymap"),
    );

    await user.keyboard("?");
    expect(
      within(screen.getByRole("dialog")).getByText(/Down.*C-n.*j.*C-j/),
    ).toBeInTheDocument();
  });

  it("境界: すべての割り当てを解除したコマンドは, キー欄が空で表示されること", async () => {
    mockHome((cmd) =>
      cmd === "load_keymap"
        ? Promise.resolve({ q: null, "C-x C-c": null })
        : undefined,
    );
    const user = await renderLoaded();
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("load_keymap"),
    );

    await user.keyboard("?");
    const row = within(screen.getByRole("dialog"))
      .getByText("quit")
      .closest("tr") as HTMLElement;
    expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("");
  });
});

describe("App (ブックマーク一覧の境界)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("境界: 割り当てのないキーを押しても何も起きないこと", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}b{/Alt}");
    await user.keyboard("z");
    expect(paneOf("left").getByText("/mock/home")).toHaveClass("file-name");
  });

  it("正常系: ブックマーク一覧の表示中に Tab を押すと, もう一方のペインがアクティブになり (ブラウザ既定のフォーカス移動は起きない), そちらを通常どおり操作できること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}b{/Alt}");
    expect(screen.getByRole("region", { name: "left pane" })).toHaveAttribute(
      "data-active",
      "true",
    );

    await user.keyboard("{Tab}");

    expect(document.activeElement).not.toBe(
      screen.getAllByLabelText("right path")[0],
    );
    expect(screen.getByRole("region", { name: "left pane" })).toHaveAttribute(
      "data-active",
      "false",
    );
    expect(screen.getByRole("region", { name: "right pane" })).toHaveAttribute(
      "data-active",
      "true",
    );
    // ブックマーク一覧は表示され続け, カーソルは非アクティブの表示になる.
    expect(
      paneOf("left").getByText("/mock/home").closest("li"),
    ).toHaveAttribute("data-cursor", "inactive");

    // アクティブになった右ペインは, 通常どおりキー操作できる.
    await user.keyboard("j");
    expect(paneOf("right").getByText("a.txt").closest("li")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("正常系: もう一度 Tab を押すと, ブックマーク一覧の側へ戻り, 一覧のキー操作が復帰すること", async () => {
    mockPhase4();
    const user = await renderLoaded();
    await user.keyboard("{Alt>}b{/Alt}");
    await user.keyboard("{Tab}");

    await user.keyboard("{Tab}");

    expect(screen.getByRole("region", { name: "left pane" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(
      paneOf("left").getByText("/mock/home").closest("li"),
    ).toHaveAttribute("data-cursor", "active");
    await user.keyboard("{Escape}");
    expect(paneOf("left").getByText("FolderA")).toBeInTheDocument();
  });

  it("正常系: 左右それぞれでブックマークを表示させると, 両方が同時に表示されたままになること", async () => {
    mockPhase4();
    const user = await renderLoaded();

    await user.keyboard("{Alt>}b{/Alt}");
    expect(paneOf("left").getByText("/mock/home")).toBeInTheDocument();

    await user.keyboard("{Tab}");
    await user.keyboard("{Enter}");
    await paneOf("right").findByText("in.txt");
    await user.keyboard("b");

    // 左ペインのブックマーク一覧は消えず, 両方が同時に見えている
    // (ブックマークの登録先はペインごとではなく共通なので, どちらにも同じ一覧が出る).
    expect(paneOf("left").getByText("/mock/home")).toBeInTheDocument();
    expect(paneOf("right").getByText("/mock/home")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "left pane" })).toHaveAttribute(
      "data-active",
      "false",
    );
    expect(screen.getByRole("region", { name: "right pane" })).toHaveAttribute(
      "data-active",
      "true",
    );

    // 左のブックマーク一覧をクリックすると, そちらがアクティブになる (右は表示されたまま).
    await user.click(paneOf("left").getByText("/mock/home"));
    expect(screen.getByRole("region", { name: "left pane" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(paneOf("right").getByText("/mock/home")).toBeInTheDocument();

    // それぞれで Esc すると, それぞれ独立して通常表示に戻る.
    await user.keyboard("{Escape}");
    expect(paneOf("left").getByText("FolderA")).toBeInTheDocument();
    expect(paneOf("right").getByText("/mock/home")).toBeInTheDocument();

    await user.keyboard("{Tab}");
    await user.keyboard("{Escape}");
    await paneOf("right").findByText("in.txt");
  });

  it("境界: 何も登録されていない状態で Enter や Delete を押しても何も起きないこと", async () => {
    mockHome();
    const user = await renderLoaded();
    await user.keyboard("b");
    await user.keyboard("{Enter}");
    expect(paneOf("left").getByText("登録されていません.")).toBeInTheDocument();
    await user.keyboard("{Delete}");
    expect(paneOf("left").getByText("登録されていません.")).toBeInTheDocument();
    await user.keyboard("u");
    expect(paneOf("left").getByText("登録されていません.")).toBeInTheDocument();
  });
});
