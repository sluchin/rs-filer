import { useEffect, useState } from "react";
import log from "loglevel";
import { loadKeymap } from "../../../services/tauriApi";
import { buildKeymap, DEFAULT_KEYMAP, type Keymap } from "../keymap";

/**
 * ユーザーの設定ファイルでキーマップを上書きするフック.
 *
 * 起動時に一度だけ設定を読み込みます. 読み込みが終わるまでは既定のキーマップを使います.
 * 不正な設定はキー操作の失敗として扱わず, 警告として `onWarning` へ渡します.
 *
 * @param onWarning - 不正な設定があったときに, 内容を受け取る関数.
 * @returns 使用するキーマップ.
 */
export function useUserKeymap(onWarning: (message: string) => void): Keymap {
  const [keymap, setKeymap] = useState<Keymap>(DEFAULT_KEYMAP);

  useEffect(() => {
    let cancelled = false;
    loadKeymap()
      .then((overrides) => {
        if (cancelled) {
          return;
        }
        const { keymap: built, warnings } = buildKeymap(overrides);
        setKeymap(built);
        for (const warning of warnings) {
          onWarning(`キーマップ設定: ${warning}`);
        }
      })
      .catch((e) => {
        log.warn("[React] キーマップ設定の読み込みに失敗:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [onWarning]);

  return keymap;
}
