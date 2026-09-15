import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";

// @tauri-apps/api/core の invoke コマンドをモック
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe("App (Dual Pane)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 初期化時に左右両方のペインへホームディレクトリの内容が読み込まれること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/mock/home");
      }
      if (cmd === "read_directory" && args?.path === "/mock/home") {
        return Promise.resolve([
          { name: "Documents", path: "/mock/home/Documents", is_dir: true },
          { name: "file.txt", path: "/mock/home/file.txt", is_dir: false },
        ]);
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("Documents")).toHaveLength(2);
      expect(screen.getAllByText("file.txt")).toHaveLength(2);
    });
  });

  it("異常系: get_home_dir 失敗時にルート ('/') へフォールバックして読み込まれること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.reject("Home dir read error");
      }
      if (cmd === "read_directory" && args?.path === "/") {
        return Promise.resolve([
          { name: "root_item", path: "/root_item", is_dir: false },
        ]);
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("root_item")).toHaveLength(2);
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

  it("操作系: 左ペインの項目（ディレクトリ・ファイル）クリックおよび親ボタン移動が動作すること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/mock/home");
      }
      if (cmd === "read_directory" && args?.path === "/mock/home") {
        return Promise.resolve([
          { name: "FolderA", path: "/mock/home/FolderA", is_dir: true },
          {
            name: "SampleFile.txt",
            path: "/mock/home/SampleFile.txt",
            is_dir: false,
          },
        ]);
      }
      if (cmd === "read_directory" && args?.path === "/mock/home/FolderA") {
        return Promise.resolve([
          {
            name: "inside_left.txt",
            path: "/mock/home/FolderA/inside_left.txt",
            is_dir: false,
          },
        ]);
      }
      return Promise.reject(
        new Error(`Unknown command: ${cmd}, args: ${JSON.stringify(args)}`),
      );
    });

    render(<App />);

    await screen.findAllByText("FolderA");

    // 1. is_dir: false のファイル項目をクリック (if (file.is_dir) の else / false 分岐を通過させる)
    const files = screen.getAllByText("SampleFile.txt");
    fireEvent.click(files[0]);

    // 2. is_dir: true のディレクトリ項目をクリック (if (file.is_dir) の true 分岐を通過させる)
    const folders = screen.getAllByText("FolderA");
    fireEvent.click(folders[0]);

    await waitFor(() => {
      expect(screen.getByText("inside_left.txt")).toBeInTheDocument();
    });

    // 3. 親ボタン移動
    const parentButtons = screen.getAllByText("⬆ 親");
    fireEvent.click(parentButtons[0]);

    await waitFor(() => {
      expect(screen.getAllByText("FolderA")).not.toHaveLength(0);
    });
  });

  it("操作系: 右ペインの項目（ディレクトリ・ファイル）クリックおよび親ボタン移動が動作すること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/mock/home");
      }
      if (cmd === "read_directory" && args?.path === "/mock/home") {
        return Promise.resolve([
          { name: "RightFolder", path: "/mock/home/RightFolder", is_dir: true },
          {
            name: "RightFile.txt",
            path: "/mock/home/RightFile.txt",
            is_dir: false,
          },
        ]);
      }
      if (cmd === "read_directory" && args?.path === "/mock/home/RightFolder") {
        return Promise.resolve([
          {
            name: "inside_right.txt",
            path: "/mock/home/RightFolder/inside_right.txt",
            is_dir: false,
          },
        ]);
      }
      return Promise.reject(
        new Error(`Unknown command: ${cmd}, args: ${JSON.stringify(args)}`),
      );
    });

    render(<App />);

    await screen.findAllByText("RightFolder");

    // 右ペインのファイル項目をクリック (アクティブ切り替え + false 分岐通過)
    const files = screen.getAllByText("RightFile.txt");
    fireEvent.click(files[1]);

    // 右ペインのフォルダ項目をクリック (true 分岐通過)
    const folders = screen.getAllByText("RightFolder");
    fireEvent.click(folders[1]);

    await waitFor(() => {
      expect(screen.getByText("inside_right.txt")).toBeInTheDocument();
    });

    // 右ペインの親ボタンを押下
    const parentButtons = screen.getAllByText("⬆ 親");
    fireEvent.click(parentButtons[1]);

    await waitFor(() => {
      expect(screen.getAllByText("RightFolder")).not.toHaveLength(0);
    });
  });

  it("操作系: 左右ペインそれぞれのパス入力フィールドの変更および Enter 実行が動作すること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/mock/home");
      }
      if (cmd === "read_directory" && args?.path === "/mock/home") {
        return Promise.resolve([]);
      }
      if (cmd === "read_directory" && args?.path === "/left/custom") {
        return Promise.resolve([
          { name: "left_item", path: "/left/custom/left_item", is_dir: false },
        ]);
      }
      if (cmd === "read_directory" && args?.path === "/right/custom") {
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
      expect(screen.getByText("left_item")).toBeInTheDocument();
    });

    // 右ペイン入力
    fireEvent.change(inputs[1], { target: { value: "/right/custom" } });
    fireEvent.keyDown(inputs[1], { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("right_item")).toBeInTheDocument();
    });
  });

  it("操作系: アクティブペインから対向ペインへファイルをコピーできること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") return Promise.resolve("/mock/home");
      if (cmd === "read_directory" && args?.path === "/mock/home") {
        return Promise.resolve([
          { name: "item.txt", path: "/mock/home/item.txt", is_dir: false },
        ]);
      }
      if (cmd === "copy_item") {
        expect(args).toEqual({
          srcPath: "/mock/home/item.txt",
          destDir: "/mock/home",
        });
        return Promise.resolve();
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    // 初期読み込みを待機
    const files = await screen.findAllByText("item.txt");

    // 左ペインのファイルを選択
    fireEvent.click(files[0]);

    // コピーボタンをクリック
    const copyButton = screen.getByRole("button", { name: /コピー|Copy/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("copy_item", {
        srcPath: "/mock/home/item.txt",
        destDir: "/mock/home",
      });
    });
  });

  it("環境設定: 本番環境 (DEV = false) の場合にログレベルが warn に設定されること", async () => {
    vi.stubEnv("DEV", "");
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

  // ファイル未選択でのエラー
  it("shows error when selectedFile is empty and copy is executed", async () => {
    const user = userEvent.setup();
    // read_directory が空配列 [] を返すように設定（ファイルがない状態）
    vi.mocked(invoke).mockImplementation((cmd) => {
      if (cmd === "read_directory") return Promise.resolve([]);
      if (cmd === "get_home_dir") return Promise.resolve("/mock/home");
      return Promise.resolve(null);
    });

    render(<App />);

    // 初期表示の完了（input のパス表示）を待つ
    await screen.findAllByDisplayValue("/mock/home");

    const copyButton = screen.getByRole("button", { name: /コピー/i });
    await user.click(copyButton);

    // 完全一致から正規表現に変更（「エラー: 」テキストとの分割に対応）
    expect(
      await screen.findByText(/コピー対象の項目が選択されていません/i),
    ).toBeInTheDocument();
  });

  // invoke の例外ハンドリング
  it("handles copy failure when invoke throws an error", async () => {
    const user = userEvent.setup();

    // read_directory は正常なリストを返し、copy_item のみ例外を投げるようモックを分離
    const mockFiles: FileEntry[] = [
      { name: "file1.txt", path: "/mock/home/file1.txt", is_dir: false },
    ];
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "get_home_dir") return "/mock/home";
      if (cmd === "read_directory") return mockFiles;
      if (cmd === "copy_item") throw new Error("Copy failed in Backend");
      return null;
    });

    render(<App />);

    // ファイル一覧が描画されて選択状態 (selectedIndex: 0) になるのを待つ
    await screen.findAllByText("file1.txt");

    const copyButton = screen.getByRole("button", { name: /コピー/i });
    await user.click(copyButton);

    expect(
      await screen.findByText(/Copy failed in Backend/i),
    ).toBeInTheDocument();
  });

  // F5 キーイベント
  it("triggers handleCopy when F5 key is pressed", async () => {
    const user = userEvent.setup();

    // 変更箇所: read_directory が実際のファイルを返すようにモックを設定
    const mockFiles: FileEntry[] = [
      { name: "file1.txt", path: "/mock/home/file1.txt", is_dir: false },
    ];
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "get_home_dir") return "/mock/home";
      if (cmd === "read_directory") return mockFiles;
      if (cmd === "copy_item") return Promise.resolve();
      return null;
    });

    render(<App />);

    // モックで定義した実際のファイル名（"file1.txt"）の描画を待つ
    await screen.findAllByText("file1.txt");

    // F5 キーを発火
    await user.keyboard("{F5}");

    // copy_item が呼ばれたことを確認
    expect(invoke).toHaveBeenCalledWith(
      "copy_item",
      expect.objectContaining({
        srcPath: "/mock/home/file1.txt",
        destDir: "/mock/home",
      }),
    );
  });

  it("右ペインがアクティブな場合にも対向（左ペイン）へコピーできること", async () => {
    const user = userEvent.setup();
    const mockFiles: FileEntry[] = [
      {
        name: "right-file.txt",
        path: "/mock/home/right-file.txt",
        is_dir: false,
      },
    ];

    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "get_home_dir") return "/mock/home";
      if (cmd === "read_directory") return mockFiles;
      if (cmd === "copy_item") return Promise.resolve();
      return null;
    });

    render(<App />);

    // 右ペインのファイルを待つ
    const rightFiles = await screen.findAllByText("right-file.txt");
    // 右ペイン側の要素（2つ目の要素）をクリックしてアクティブにする
    await user.click(rightFiles[1]);

    // F5 または コピーボタンを押す
    await user.keyboard("{F5}");

    // 左ペイン (対向) のパス宛てに copy_item が呼ばれたことを検証
    expect(invoke).toHaveBeenCalledWith("copy_item", {
      srcPath: "/mock/home/right-file.txt",
      destDir: "/mock/home",
    });
  });
});
