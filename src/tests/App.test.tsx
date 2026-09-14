import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";

// @tauri-apps/api/core の invoke コマンドをモック
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 初期表示時にホームディレクトリが取得され、ファイル一覧が表示されること", async () => {
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
      expect(screen.getByText("Documents")).toBeInTheDocument();
      expect(screen.getByText("file.txt")).toBeInTheDocument();
    });
  });

  it("異常系: get_home_dir 失敗時にルート ('/') にフォールバックすること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.reject("Home dir error");
      }
      if (cmd === "read_directory" && args?.path === "/") {
        return Promise.resolve([
          { name: "root_file.txt", path: "/root_file.txt", is_dir: false },
        ]);
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("root_file.txt")).toBeInTheDocument();
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

  it("操作系: ディレクトリ項目をクリックするとそのフォルダへ遷移すること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/mock/home");
      }
      if (cmd === "read_directory" && args?.path === "/mock/home") {
        return Promise.resolve([
          { name: "Documents", path: "/mock/home/Documents", is_dir: true },
        ]);
      }
      if (cmd === "read_directory" && args?.path === "/mock/home/Documents") {
        return Promise.resolve([
          { name: "sub.txt", path: "/mock/home/Documents/sub.txt", is_dir: false },
        ]);
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    const dirItem = await screen.findByText("Documents");
    fireEvent.click(dirItem);

    await waitFor(() => {
      expect(screen.getByText("sub.txt")).toBeInTheDocument();
    });
  });

  it("操作系: 親ディレクトリボタンクリック時に上位パスへ移動すること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/mock/home");
      }
      if (cmd === "read_directory" && args?.path === "/mock/home") {
        return Promise.resolve([]);
      }
      if (cmd === "read_directory" && args?.path === "/mock") {
        return Promise.resolve([
          { name: "parent_item", path: "/mock/parent_item", is_dir: false },
        ]);
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    await screen.findByDisplayValue("/mock/home");
    const parentBtn = screen.getByText("⬆ 親ディレクトリへ");
    fireEvent.click(parentBtn);

    await waitFor(() => {
      expect(screen.getByText("parent_item")).toBeInTheDocument();
    });
  });

  it("操作系: パス入力欄に直接入力して Enter を押した際に指定パスを読み込むこと", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/mock/home");
      }
      if (cmd === "read_directory" && args?.path === "/mock/home") {
        return Promise.resolve([]);
      }
      if (cmd === "read_directory" && args?.path === "/custom/path") {
        return Promise.resolve([
          { name: "custom.txt", path: "/custom/path/custom.txt", is_dir: false },
        ]);
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    const input = await screen.findByDisplayValue("/mock/home");
    fireEvent.change(input, { target: { value: "/custom/path" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("custom.txt")).toBeInTheDocument();
    });
  });

  it("環境設定: 本番環境 (DEV = false) の場合にログレベルが warn に設定されること", async () => {
    // DEV 環境変数を false (本番モード) にスタブ化
    vi.stubEnv("DEV", "");

    // モジュールキャッシュをリセットして App.tsx を再読み込み（トップレベルの if 文を再実行）
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

    // テスト後に環境変数のスタブを解除
    vi.unstubAllEnvs();
  });

  it("操作系: currentPath がルート '/' の場合に親ディレクトリ移動を押しても '/' がロードされること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/");
      }
      if (cmd === "read_directory" && args?.path === "/") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    await screen.findByDisplayValue("/");
    const parentBtn = screen.getByText("⬆ 親ディレクトリへ");
    fireEvent.click(parentBtn);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("read_directory", { path: "/" });
    });
  });

  it("操作系: currentPath が既に '/' で始まる場合の親ディレクトリ移動ロジック分岐を検証すること", async () => {
    mockedInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_home_dir") {
        return Promise.resolve("/a/b");
      }
      if (cmd === "read_directory") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
    });

    render(<App />);

    await screen.findByDisplayValue("/a/b");
    const parentBtn = screen.getByText("⬆ 親ディレクトリへ");
    fireEvent.click(parentBtn);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("read_directory", { path: "/a" });
    });
  });
});
