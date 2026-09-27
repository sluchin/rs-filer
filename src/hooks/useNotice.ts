import { useCallback, useEffect, useState } from "react";

/** 通知を表示しておく時間 (ミリ秒). */
const NOTICE_MS = 5000;

/**
 * 完了などの通知メッセージを, 一定時間だけ表示するフック.
 *
 * @param onNotify - 通知するたびに呼ぶ関数 (操作ログへの記録など).
 * @returns 表示中の通知と, 通知する関数.
 */
export function useNotice(onNotify: (message: string) => void) {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  /**
   * 通知を表示します.
   *
   * @param message - 通知するメッセージ.
   */
  const notify = useCallback(
    (message: string): void => {
      setNotice(message);
      onNotify(message);
    },
    [onNotify],
  );

  return { notice, notify };
}
