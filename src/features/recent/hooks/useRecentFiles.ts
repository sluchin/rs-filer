import { useCallback, useEffect, useRef, useState } from "react";
import log from "loglevel";
import { loadRecentFiles, saveRecentFiles } from "../../../services/tauriApi";
import { DEFAULT_RECENT_FILES_LIMIT } from "../../settings/types";

/** 一覧が変わってから, 保存するまでの待ち時間 (ミリ秒). 続けて開いたときに, 何度も書かないため. */
const SAVE_DELAY_MS = 1000;

/**
 * 最近開いたファイルの一覧を保持するフック.
 *
 * 起動したときに, 前に保存した一覧 (今は無いファイルは除かれている) を読み込み, 今回開いたファイルの前に並べます.
 * 一覧が変わったら, 少し待ってから保存します (読み込みが終わるまでは, 保存しません).
 * 件数の上限を超えたら古い方から捨てます. 同じファイルは 1 つだけで, 開き直すと最新の位置へ移ります.
 *
 * @param limit - 件数の上限 (設定の `recent_files_limit`).
 * @returns 新しい順の一覧と, 記録・取り除きの関数.
 */
export function useRecentFiles(limit: number = DEFAULT_RECENT_FILES_LIMIT) {
  /** 古い順の一覧. */
  const [entries, setEntries] = useState<string[]>([]);
  const loaded = useRef(false);
  /** 件数の上限. 読み込みの結果にも使うので, 最新の値を ref で持つ. */
  const limitRef = useRef(Math.max(1, limit));

  // 上限が変わったら (設定の読み込みが, 一覧の読み込みより後に終わることもある), 一覧を上限までに絞る.
  useEffect(() => {
    limitRef.current = Math.max(1, limit);
    setEntries((prev) => prev.slice(-limitRef.current));
  }, [limit]);

  useEffect(() => {
    let cancelled = false;
    loadRecentFiles()
      .then((saved) => {
        if (cancelled) {
          return;
        }
        setEntries((current) =>
          [
            ...(saved ?? []).filter((p) => !current.includes(p)),
            ...current,
          ].slice(-limitRef.current),
        );
        loaded.current = true;
      })
      .catch((e) => {
        log.warn("最近開いたファイルの読み込みに失敗:", e);
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
      saveRecentFiles(entries).catch((e) => {
        log.warn("最近開いたファイルの保存に失敗:", e);
      });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [entries]);

  /**
   * ファイルを一覧の最新の位置へ記録します. 既にあれば移します.
   *
   * @param path - 開いたファイルの絶対パス.
   */
  const record = useCallback((path: string): void => {
    setEntries((prev) =>
      [...prev.filter((p) => p !== path), path].slice(-limitRef.current),
    );
  }, []);

  /**
   * ファイルを一覧から取り除きます.
   *
   * @param path - 取り除くファイルの絶対パス.
   */
  const remove = useCallback((path: string): void => {
    setEntries((prev) => prev.filter((p) => p !== path));
  }, []);

  return { files: [...entries].reverse(), record, remove };
}
