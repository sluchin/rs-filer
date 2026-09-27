/**
 * テーマ (配色).
 */
export type Theme = "classic" | "dark";

/**
 * フォントサイズ.
 */
export type FontSize = "small" | "medium" | "large";

/**
 * アプリケーションの設定 (`config.json` に永続化される).
 */
export interface AppConfig {
  /**
   * テーマ.
   */
  theme: Theme;
  /**
   * フォントサイズ.
   */
  font_size: FontSize;
  /**
   * エディタのコマンド. 指定が無い場合は環境変数 `VISUAL` / `EDITOR` を使う.
   */
  editor: string | null;
  /**
   * ターミナルのコマンド. 指定が無い場合は OS ごとの既定のターミナルを順に試す.
   */
  terminal: string | null;
}

/** 既定の設定 (バックエンドの `AppConfig::default()` に合わせる). */
export const DEFAULT_CONFIG: AppConfig = {
  theme: "classic",
  font_size: "medium",
  editor: null,
  terminal: null,
};

/** `M-t` でテーマを切り替えるときの順番. */
export const THEME_CYCLE: Theme[] = ["classic", "dark"];

/** `M-0` でフォントサイズを切り替えるときの順番. */
export const FONT_SIZE_CYCLE: FontSize[] = ["small", "medium", "large"];
