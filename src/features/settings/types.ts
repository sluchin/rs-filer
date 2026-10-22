/**
 * テーマ (配色).
 */
export type Theme = "classic" | "dark";

/**
 * フォントサイズ.
 */
export type FontSize = "small" | "medium" | "large";

/**
 * ファイル一覧の列幅設定.
 */
export interface ColumnWidths {
  /** ファイル名の列の幅 (px). */
  col_name?: number;
  /** サイズの列の幅 (px). */
  col_size?: number;
  /** 更新日時の列の幅 (px). */
  col_date?: number;
  /** 属性の列の幅 (px). */
  col_attr?: number;
}

/** 名前の列の幅を保存していないときに, キー操作で幅を変える起点にする幅 (px). */
export const DEFAULT_NAME_COLUMN_WIDTH = 300;

/**
 * ペイン毎の列幅設定.
 */
export interface PaneColumnWidths {
  /** 左ペインの列幅. */
  left?: ColumnWidths;
  /** 右ペインの列幅. */
  right?: ColumnWidths;
}

/**
 * 前回終了時の, 左右のペインのディレクトリ.
 */
export interface LastPaths {
  /** 左ペインのディレクトリ. */
  left: string;
  /** 右ペインのディレクトリ. */
  right: string;
}

/**
 * 左右のペインの, ディレクトリの移動履歴 (`history.json` に永続化される).
 */
export interface PaneHistory {
  /** 左ペインの履歴 (古い順). */
  left: string[];
  /** 右ペインの履歴 (古い順). */
  right: string[];
}

/** ディレクトリの移動履歴の, ペインごとの件数の上限の既定値 (バックエンドの `DEFAULT_HISTORY_LIMIT` に合わせる). */
export const DEFAULT_HISTORY_LIMIT = 1000;

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
  /**
   * ファイル一覧の列幅 (ペイン毎).
   */
  pane_column_widths?: PaneColumnWidths;
  /**
   * 前回終了時の, 左右のペインのディレクトリ. 保存されていない場合は無い.
   */
  last_paths?: LastPaths | null;
  /**
   * ディレクトリの移動履歴の, ペインごとの件数の上限. 超えたら, 古い方から捨てる. 利用者が `config.json` を
   * 書き換えて変える.
   */
  history_limit?: number;
}

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
