import { useEffect, useState } from "react";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import loglevel from "loglevel";
import { readPreview } from "../../../services/tauriApi";
import type { Preview, PreviewState } from "../types";

/** この機能のロガー. */
const log = loglevel.getLogger("preview");

/** パスが変わってから, 取得を始めるまで待つ時間 (ミリ秒). */
const FETCH_DELAY_MS = 100;

/** 取得結果. どのパスに対する結果かを持つ. */
type Result =
  | { path: string; preview: Preview; error?: undefined }
  | { path: string; preview?: undefined; error: string };

/**
 * ファイルのプレビューを取得するフック. パスが変わるたびに取得し直します.
 *
 * カーソルを続けて動かしている間は取得せず, パスが `FETCH_DELAY_MS` の間変わらなかったら取得します
 * (途中の項目の読み込みと, 大きな画像の受け渡しを省くため). それまでは `loading` を返します.
 *
 * @param path - プレビューするファイルのパス. 無い場合 (ディレクトリなど) は null.
 * @returns プレビューの取得状況.
 */
export function usePreview(path: string | null): PreviewState {
  const [result, setResult] = useState<Result | null>(null);

  const target = useDebouncedValue(path, FETCH_DELAY_MS);

  useEffect(() => {
    if (target === null) {
      return;
    }
    const path = target;
    let cancelled = false;
    readPreview(path)
      .then((preview) => {
        if (!cancelled) {
          setResult({ path, preview });
        }
      })
      .catch((e) => {
        log.warn("プレビューの取得に失敗:", e);
        if (!cancelled) {
          setResult({ path, error: String(e) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  if (path === null) {
    return { status: "idle" };
  }
  if (result?.path !== path) {
    return { status: "loading" };
  }
  return result.preview
    ? { status: "ready", preview: result.preview }
    : { status: "error", message: result.error };
}
