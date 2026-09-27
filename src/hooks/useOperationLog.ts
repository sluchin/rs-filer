import { useCallback, useState } from "react";

/** 保持する操作ログの最大件数. */
const MAX_ENTRIES = 200;

/**
 * 操作ログの 1 件.
 */
export interface LogEntry {
  /** 記録した時刻 (UNIX 時刻のミリ秒). */
  time: number;
  /** 種類. エラーは "error", それ以外は "info". */
  level: "info" | "error";
  /** メッセージ. */
  message: string;
}

/**
 * 操作ログを保持するフック. 新しいものが後ろに並びます.
 *
 * @returns ログの一覧と, 追加する関数.
 */
export function useOperationLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  /**
   * ログを 1 件追加します. 最大件数を超えた分は, 古いものから捨てます.
   *
   * @param level - 種類.
   * @param message - メッセージ.
   */
  const addLog = useCallback((level: LogEntry["level"], message: string) => {
    setEntries((prev) =>
      [...prev, { time: Date.now(), level, message }].slice(-MAX_ENTRIES),
    );
  }, []);

  return { entries, addLog };
}
