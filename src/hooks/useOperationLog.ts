import { useCallback, useEffect, useRef, useState } from "react";
import log from "loglevel";
import { loadOperationLog, saveOperationLog } from "../services/tauriApi";

/** 保持する操作ログの最大件数 (期間は, 保存するときに 30 日までに絞る). */
const MAX_ENTRIES = 5000;

/** ログが変わってから, 保存するまでの待ち時間 (ミリ秒). 続けて追加されたときに, 何度も書かないため. */
const SAVE_DELAY_MS = 1000;

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
 * 起動したときに, 前に保存したログ (30 日以内) を読み込み, 今回のログの前に並べます.
 * ログが変わったら, 少し待ってから保存します (読み込みが終わるまでは, 保存しません).
 *
 * @returns ログの一覧と, 追加する関数.
 */
export function useOperationLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadOperationLog()
      .then((saved) => {
        if (cancelled) {
          return;
        }
        const previous: LogEntry[] = (saved ?? []).map((e) => ({
          time: e.time,
          level: e.level === "error" ? "error" : "info",
          message: e.message,
        }));
        setEntries((current) => [...previous, ...current].slice(-MAX_ENTRIES));
        loaded.current = true;
      })
      .catch((e) => {
        log.warn("操作ログの読み込みに失敗:", e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded.current) {
      return;
    }
    const timer = setTimeout(() => {
      saveOperationLog(entries).catch((e) => {
        log.warn("操作ログの保存に失敗:", e);
      });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [entries]);

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
