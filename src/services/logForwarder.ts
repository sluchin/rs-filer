import log from "loglevel";
import { logFrontendMessage, type LogLevel } from "./tauriApi";

/** バックエンドへ転送する対象の, `loglevel` のメソッド名. */
const FORWARDABLE_LEVELS: readonly string[] = [
  "debug",
  "info",
  "warn",
  "error",
];

/**
 * ログの引数を, バックエンドへ送る 1 行の文字列にします.
 *
 * @param args - `log.debug` などに渡された引数.
 * @returns 整形した文字列.
 */
function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.stack ?? arg.message;
      }
      return typeof arg === "string" ? arg : JSON.stringify(arg);
    })
    .join(" ");
}

/**
 * `installLogForwarding` のオプション.
 */
export interface InstallLogForwardingOptions {
  /**
   * true の場合, テスト環境でもガードせずに設定する. このモジュール自身のテストのためのもので,
   * アプリの起動時には指定しない.
   */
  force?: boolean;
}

/**
 * `loglevel` の出力を, ブラウザの開発者ツールのコンソールに加えて, バックエンドのログ
 * (標準エラー出力とログファイル) へも転送するよう設定します. アプリの起動時に 1 度だけ呼びます.
 *
 * `trace` は対象外です (このアプリでは使っていないため). また, テスト環境 (`vitest`,
 * `import.meta.env.MODE === "test"`) では, バックエンドが実在せず, invoke のモックの呼び出し回数を
 * 検証しているテストと干渉するため, 既定では何もしません.
 *
 * @param options - オプション.
 */
export function installLogForwarding(
  options: InstallLogForwardingOptions = {},
): void {
  if (!options.force && import.meta.env.MODE === "test") {
    return;
  }
  const originalFactory = log.methodFactory;
  log.methodFactory = (methodName, logLevel, loggerName) => {
    const rawMethod = originalFactory(methodName, logLevel, loggerName);
    if (!FORWARDABLE_LEVELS.includes(methodName)) {
      return rawMethod;
    }
    const level = methodName as LogLevel;
    return (...args: unknown[]) => {
      rawMethod(...args);
      try {
        // バックエンドへの転送に失敗しても, 画面表示への影響は無いので無視する
        // (ここで log.* を呼ぶと転送が転送を呼ぶ無限ループになるため, 呼ばない).
        Promise.resolve(logFrontendMessage(level, formatArgs(args))).catch(
          () => {},
        );
      } catch {
        // invoke 自体が同期的に例外を投げた場合も, 同様に無視する.
      }
    };
  };
  log.rebuild();
}
