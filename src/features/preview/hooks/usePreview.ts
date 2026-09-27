import { useEffect, useState } from "react";
import log from "loglevel";
import { readPreview } from "../../../services/tauriApi";
import type { Preview, PreviewState } from "../types";

/** 取得結果. どのパスに対する結果かを持つ. */
type Result =
  | { path: string; preview: Preview; error?: undefined }
  | { path: string; preview?: undefined; error: string };

/**
 * ファイルのプレビューを取得するフック. パスが変わるたびに取得し直します.
 *
 * @param path - プレビューするファイルのパス. 無い場合 (ディレクトリなど) は null.
 * @returns プレビューの取得状況.
 */
export function usePreview(path: string | null): PreviewState {
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (path === null) {
      return;
    }
    let cancelled = false;
    readPreview(path)
      .then((preview) => {
        if (!cancelled) {
          setResult({ path, preview });
        }
      })
      .catch((e) => {
        log.warn("[React] プレビューの取得に失敗:", e);
        if (!cancelled) {
          setResult({ path, error: String(e) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

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
