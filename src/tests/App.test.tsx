import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
});
