import { useEffect, useState } from "react";
import log from "loglevel";
import { getDirStats, getItemInfo } from "../../../services/tauriApi";
import type { DirStats, InfoState, ItemInfo, StatsState } from "../types";

/** 取得結果. どのパスに対する結果かを持つ. */
type Result<T> =
  | { path: string; value: T; error?: undefined }
  | { path: string; value?: undefined; error: string };

/**
 * パスごとに非同期で値を取得するフックの共通部分. パスが変わるたびに取得し直し, 古いパスの結果は捨てます.
 *
 * @param path - 取得するパス. 無い場合は null (何もしない).
 * @param fetcher - 取得する関数.
 * @param label - 失敗したときのログの表示名.
 * @returns 取得状況.
 */
function useByPath<T>(
  path: string | null,
  fetcher: (path: string) => Promise<T>,
  label: string,
):
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: T } {
  const [result, setResult] = useState<Result<T> | null>(null);

  useEffect(() => {
    if (path === null) {
      return;
    }
    let cancelled = false;
    fetcher(path)
      .then((value) => {
        if (!cancelled) {
          setResult({ path, value });
        }
      })
      .catch((e) => {
        log.warn(`[React] ${label}の取得に失敗:`, e);
        if (!cancelled) {
          setResult({ path, error: String(e) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, fetcher, label]);

  if (path === null) {
    return { status: "idle" };
  }
  if (result?.path !== path) {
    return { status: "loading" };
  }
  return result.error === undefined
    ? { status: "ready", value: result.value }
    : { status: "error", message: result.error };
}

/**
 * ファイル・ディレクトリの詳細を取得するフック. パスが変わるたびに取得し直します.
 *
 * @param path - 詳細を表示する項目のパス. 無い場合は null.
 * @returns 詳細の取得状況.
 */
export function useItemInfo(path: string | null): InfoState {
  const state = useByPath<ItemInfo>(path, getItemInfo, "詳細");
  return state.status === "ready"
    ? { status: "ready", info: state.value }
    : state;
}

/**
 * ディレクトリの配下の合計を数えるフック. パスが変わると, 数え直します (バックエンドは, 前の計算を中断する).
 *
 * @param path - 数えるディレクトリのパス. ディレクトリでない・表示しない場合は null.
 * @returns 計算の状況. 数え終わるまでは `loading`.
 */
export function useDirStats(path: string | null): StatsState {
  const state = useByPath<DirStats>(path, getDirStats, "配下の合計");
  return state.status === "ready"
    ? { status: "ready", stats: state.value }
    : state;
}
