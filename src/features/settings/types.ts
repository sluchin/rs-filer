import type {
  AppConfig_Serialize,
  ColumnWidths_Serialize,
  FontSize,
  LastPaths,
  PaneColumnWidths_Serialize,
  PaneHistory_Serialize,
  Theme,
} from "../../bindings";

/** アプリケーションの設定 (バックエンドから受け取る形. そのまま `save_config` にも渡せる). */
export type AppConfig = AppConfig_Serialize;

/** ファイル一覧の列幅設定. */
export type ColumnWidths = ColumnWidths_Serialize;

/** ペイン毎の列幅設定. */
export type PaneColumnWidths = PaneColumnWidths_Serialize;

/** ディレクトリの移動履歴 (ペイン毎). */
export type PaneHistory = PaneHistory_Serialize;

export type { FontSize, LastPaths, Theme };

/** 名前の列の幅を保存していないときに, キー操作で幅を変える起点にする幅 (px). */
export const DEFAULT_NAME_COLUMN_WIDTH = 300;

/** ディレクトリの移動履歴の, ペインごとの件数の上限の既定値 (バックエンドの `DEFAULT_HISTORY_LIMIT` に合わせる). */
export const DEFAULT_HISTORY_LIMIT = 1000;

/** 既定の設定 (バックエンドの `AppConfig::default()` に合わせる). */
export const DEFAULT_CONFIG: AppConfig = {
  theme: "classic",
  font_size: "medium",
  editor: null,
  terminal: null,
  pane_column_widths: { left: {}, right: {} },
  history_limit: DEFAULT_HISTORY_LIMIT,
};

/** `M-t` でテーマを切り替えるときの順番. */
export const THEME_CYCLE: Theme[] = ["classic", "dark"];

/** `M-0` でフォントサイズを切り替えるときの順番. */
export const FONT_SIZE_CYCLE: FontSize[] = ["small", "medium", "large"];
