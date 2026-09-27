import { useEffect, useState } from "react";
import log from "loglevel";
import { getDiskSpace } from "../../../services/tauriApi";
import type { DiskSpace } from "../types";

/**
 * 指定パスが載っているディスクの空き容量を取得するフック.
 *
 * @param path - 調べるパス.
 * @returns 空き容量と全体の容量. 取得できない場合は null.
 */
export function useDiskSpace(path: string): DiskSpace | null {
  const [space, setSpace] = useState<DiskSpace | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDiskSpace(path)
      .then((s) => {
        if (!cancelled) {
          setSpace(typeof s?.free === "number" ? s : null);
        }
      })
      .catch((e) => {
        log.warn("[React] ディスク容量の取得に失敗:", e);
        if (!cancelled) {
          setSpace(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return space;
}
