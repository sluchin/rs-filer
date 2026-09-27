import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import log from "loglevel";
import { invoke } from "@tauri-apps/api/core";
import { installLogForwarding } from "../services/logForwarder";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const originalFactory = log.methodFactory;

describe("installLogForwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    log.methodFactory = originalFactory;
    log.setLevel("trace");
    log.rebuild();
  });

  afterEach(() => {
    log.methodFactory = originalFactory;
    log.rebuild();
  });

  it("正常系: debug/info/warn/error はバックエンドへ転送されること", () => {
    mockedInvoke.mockResolvedValue(undefined);
    installLogForwarding({ force: true });

    log.info("hello", 1);

    expect(mockedInvoke).toHaveBeenCalledWith("log_frontend_message", {
      level: "info",
      message: "hello 1",
    });
  });

  it("正常系: Error オブジェクトはスタックトレースにして転送されること", () => {
    mockedInvoke.mockResolvedValue(undefined);
    installLogForwarding({ force: true });
    const error = new Error("boom");

    log.error(error);

    expect(mockedInvoke).toHaveBeenCalledWith("log_frontend_message", {
      level: "error",
      message: error.stack,
    });
  });

  it("正常系: バックエンドへの転送が失敗しても例外にならないこと", () => {
    mockedInvoke.mockRejectedValue(new Error("network"));
    installLogForwarding({ force: true });

    expect(() => log.warn("oops")).not.toThrow();
  });

  it("異常系: テスト環境では既定では転送を設定しないこと", () => {
    installLogForwarding();

    log.info("no forward");

    expect(mockedInvoke).not.toHaveBeenCalled();
  });
});
