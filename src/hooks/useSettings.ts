import { useCallback, useEffect, useState } from "react";
import log from "loglevel";
import { loadConfig, saveConfig } from "../services/tauriApi";
import {
  DEFAULT_CONFIG,
  FONT_SIZE_CYCLE,
  THEME_CYCLE,
  type AppConfig,
  type ColumnWidths,
} from "../features/settings/types";

/**
 * 並びの中で, 現在の値の次の値を返します. 最後の次は最初に戻ります. 見つからない場合は先頭を返します.
 *
 * @param cycle - 並び.
 * @param current - 現在の値.
 * @returns 次の値.
 */
function next<T>(cycle: T[], current: T): T {
  const index = cycle.indexOf(current);
  return cycle[(index + 1) % cycle.length];
}

/**
 * アプリケーションの設定 (テーマ・フォントサイズ・エディタ・ターミナル) を保持し,
 * 変更のたびに設定ファイルへ保存するフック.
 *
 * 起動時に一度だけ設定ファイルを読み込みます. 読み込みが終わるまでは既定値を使います.
 *
 * @returns 現在の設定と, テーマ・フォントサイズを切り替える関数.
 */
export function useSettings() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    let cancelled = false;
    loadConfig()
      .then((loaded) => {
        if (!cancelled) {
          // バックエンドは常に完全な AppConfig を返すが, 念のため既定値の上に重ねる
          // (Rust 側の #[serde(default)] と同じ考え方).
          setConfig({ ...DEFAULT_CONFIG, ...loaded });
        }
      })
      .catch((e) => {
        log.warn("[React] 設定の読み込みに失敗:", e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 設定を書き換え, 設定ファイルへ保存します.
   *
   * @param patch - 変更する設定.
   */
  const update = useCallback((patch: Partial<AppConfig>): void => {
    setConfig((prev) => {
      const updated = { ...prev, ...patch };
      saveConfig(updated).catch((e) => {
        log.warn("[React] 設定の保存に失敗:", e);
      });
      return updated;
    });
  }, []);

  /** テーマを次のものに切り替えます. */
  const cycleTheme = useCallback(
    (): void => update({ theme: next(THEME_CYCLE, config.theme) }),
    [config.theme, update],
  );

  /** フォントサイズを次のものに切り替えます. */
  const cycleFontSize = useCallback(
    (): void => update({ font_size: next(FONT_SIZE_CYCLE, config.font_size) }),
    [config.font_size, update],
  );

  /** ペインの列幅を更新します. */
  const updatePaneColumnWidth = useCallback(
    (paneId: "left" | "right", widths: ColumnWidths): void => {
      const current = config.pane_column_widths || { left: {}, right: {} };
      update({
        pane_column_widths: {
          ...current,
          [paneId]: widths,
        },
      });
    },
    [config.pane_column_widths, update],
  );

  return { config, cycleTheme, cycleFontSize, update, updatePaneColumnWidth };
}
