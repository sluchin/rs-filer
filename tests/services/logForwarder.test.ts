import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import log from "loglevel";
import { invoke } from "@tauri-apps/api/core";
import { installLogForwarding } from "@/services/logForwarder";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const originalFactory = log.methodFactory;
/** 転送を設定する前に作った (モジュールの読み込み時に作られたのと同じ), 名前付きのロガー. */
const earlyLogger = log.getLogger("early");
/** テストの開始時刻 (UNIX 時間のミリ秒). */
const NOW = 1_761_351_931_000;

/**
 * 転送されたログ (呼び出しごとの配列) を返す.
 */
function sentBatches(): unknown[] {
  return mockedInvoke.mock.calls.map(
    ([, args]) => (args as { entries: unknown }).entries,
  );
}

describe("installLogForwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockedInvoke.mockResolvedValue(undefined);
    log.methodFactory = originalFactory;
    log.setLevel("trace");
    log.rebuild();
  });

  afterEach(() => {
    vi.useRealTimers();
    log.methodFactory = originalFactory;
    for (const logger of Object.values(log.getLoggers())) {
      logger.methodFactory = originalFactory;
    }
    log.rebuild();
  });

  it("正常系: debug/info/warn は, 待ってから古い順にまとめて 1 回で転送されること", () => {
    installLogForwarding({ force: true });

    log.debug("a");
    vi.advanceTimersByTime(50);
    log.info("hello", 1);
    log.warn("w", { x: 1 });
    expect(mockedInvoke).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);

    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith("log_frontend_message", {
      entries: [
        { level: "debug", time: NOW, name: "", message: "a" },
        { level: "info", time: NOW + 50, name: "", message: "hello 1" },
        { level: "warn", time: NOW + 50, name: "", message: 'w {"x":1}' },
      ],
    });

    // 時刻は, 送った時刻ではなく, ログを出した時刻. 送った後のログは, 次の回にまとめる.
    log.info("next");
    vi.advanceTimersByTime(200);
    expect(sentBatches()[1]).toEqual([
      { level: "info", time: NOW + 200, name: "", message: "next" },
    ]);
  });

  it("正常系: 名前付きのロガーは, その名前を付けて転送されること", () => {
    installLogForwarding({ force: true });
    const lateLogger = log.getLogger("late");

    earlyLogger.info("e");
    lateLogger.warn("l");
    log.info("root");
    vi.advanceTimersByTime(200);

    // 転送の設定の前に作ったロガーも, 後に作ったロガーも転送する.
    expect(sentBatches()).toEqual([
      [
        { level: "info", time: NOW, name: "early", message: "e" },
        { level: "warn", time: NOW, name: "late", message: "l" },
        { level: "info", time: NOW, name: "", message: "root" },
      ],
    ]);
  });

  it("正常系: エラーは, それまでにたまった分と一緒に, 待たずに転送されること", () => {
    installLogForwarding({ force: true });
    const error = new Error("boom");

    log.info("before");
    log.error(error);

    expect(sentBatches()).toEqual([
      [
        { level: "info", time: NOW, name: "", message: "before" },
        { level: "error", time: NOW, name: "", message: error.stack },
      ],
    ]);
    // 待っていた分も送ったので, 後から重ねて送らない.
    vi.advanceTimersByTime(200);
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it("境界: スタックトレースの無い Error は, メッセージを転送すること", () => {
    installLogForwarding({ force: true });
    const error = new Error("no stack");
    error.stack = undefined;

    log.error(error);

    expect(sentBatches()).toEqual([
      [{ level: "error", time: NOW, name: "", message: "no stack" }],
    ]);
  });

  it("境界: 50 件たまったら, 待たずに転送すること", () => {
    installLogForwarding({ force: true });

    for (let i = 0; i < 49; i++) {
      log.info(`m${i}`);
    }
    expect(mockedInvoke).not.toHaveBeenCalled();
    log.info("m49");

    expect(sentBatches()).toHaveLength(1);
    expect(sentBatches()[0]).toHaveLength(50);
  });

  it("境界: 4000 文字を超えるメッセージは, 先頭だけにして, 省いた文字数を書くこと", () => {
    installLogForwarding({ force: true });

    log.error("x".repeat(4000));
    log.error("y".repeat(4001));

    expect(sentBatches()).toEqual([
      [{ level: "error", time: NOW, name: "", message: "x".repeat(4000) }],
      [
        {
          level: "error",
          time: NOW,
          name: "",
          message: `${"y".repeat(4000)}... (1 文字を省略)`,
        },
      ],
    ]);
  });

  it("異常系: バックエンドへの転送が失敗しても例外にならないこと", () => {
    mockedInvoke.mockRejectedValue(new Error("network"));
    installLogForwarding({ force: true });

    expect(() => log.error("oops")).not.toThrow();
  });

  it("異常系: invoke が同期的に例外を投げても, 例外にならないこと", () => {
    mockedInvoke.mockImplementation(() => {
      throw new Error("sync");
    });
    installLogForwarding({ force: true });

    expect(() => log.error("oops")).not.toThrow();
  });

  it("異常系: テスト環境では既定では転送を設定しないこと", () => {
    installLogForwarding();

    log.error("no forward");
    vi.advanceTimersByTime(200);

    expect(mockedInvoke).not.toHaveBeenCalled();
  });
});
