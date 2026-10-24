import { useCallback, useEffect, useRef, useState } from "react";
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
 * @returns 現在の設定, 設定ファイルを読み込めたか (`loaded`), テーマ・フォントサイズを切り替える関数.
 */
export function useSettings() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  /** 設定ファイルを読み込めたら true. 読み込めなかった場合は false のまま (既定値で動く). */
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadConfig()
      .then((loaded) => {
        if (!cancelled) {
          // バックエンドは常に完全な AppConfig を返すが, 念のため既定値の上に重ねる
          // (Rust 側の #[serde(default)] と同じ考え方).
          setConfig({ ...DEFAULT_CONFIG, ...loaded });
          setLoaded(true);
        }
      })
      .catch((e) => {
        log.warn("[React] 設定の読み込みに失敗:", e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** `update` で書き換えて, まだ保存していなければ true (読み込んだだけの設定は, 保存しない). */
  const unsaved = useRef(false);

  // 書き換えた設定を, 描画の後で保存する. 同じ描画の中で何度か書き換えても, 保存は最後の 1 回にまとまる.
  useEffect(() => {
    if (!unsaved.current) {
      return;
    }
    unsaved.current = false;
    saveConfig(config).catch((e) => {
      log.warn("[React] 設定の保存に失敗:", e);
    });
  }, [config]);

  /**
   * 設定を書き換えます. 書き換えた設定は, 描画の後で設定ファイルへ保存します.
   *
   * @param patch - 変更する設定.
   */
  const update = useCallback((patch: Partial<AppConfig>): void => {
    unsaved.current = true;
    setConfig((prev) => ({ ...prev, ...patch }));
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
      update({
        pane_column_widths: {
          ...config.pane_column_widths,
          [paneId]: widths,
        },
      });
    },
    [config.pane_column_widths, update],
  );

  return {
    config,
    loaded,
    cycleTheme,
    cycleFontSize,
    update,
    updatePaneColumnWidth,
  };
}
