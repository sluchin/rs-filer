/**
 * 項目の種類.
 */
export type ItemKind = "file" | "dir" | "symlink" | "other";

/**
 * 1 つの項目の詳細 (バックエンドの `ItemInfo`).
 */
export interface ItemInfo {
  /** 名前. */
  name: string;
  /** 絶対パス. */
  path: string;
  /** 種類. */
  kind: ItemKind;
  /** サイズ (バイト). ディレクトリでは 0. */
  size: number;
  /** 最終更新日時 (UNIX 時刻の秒). 不明な場合は null. */
  modified: number | null;
  /** 作成日時 (UNIX 時刻の秒). 不明な場合は null. */
  created: number | null;
  /** 最終アクセス日時 (UNIX 時刻の秒). 不明な場合は null. */
  accessed: number | null;
  /** 読み取り専用の場合は true. */
  readonly: boolean;
  /** 隠しファイルの場合は true. */
  hidden: boolean;
  /** 権限 (例: `rwxr-xr-x (0755)`). Unix のみ. それ以外は null. */
  permissions: string | null;
  /** シンボリックリンクの, リンク先. リンクでない場合は null. */
  symlink_target: string | null;
  /** 拡張子 (ドットなし). 無い場合は null. */
  extension: string | null;
  /** ディレクトリの直下にあるファイルの数. ディレクトリ以外は null. */
  child_files: number | null;
  /** ディレクトリの直下にあるディレクトリの数. ディレクトリ以外は null. */
  child_dirs: number | null;
}

/**
 * ディレクトリの配下 (再帰) の合計 (バックエンドの `DirStats`).
 */
export interface DirStats {
  /** ファイルの数. */
  files: number;
  /** ディレクトリの数 (対象自身を含まない). */
  dirs: number;
  /** ファイルの合計サイズ (バイト). */
  bytes: number;
  /** 読み取れなかった項目の数. */
  errors: number;
  /** 最後まで数えた場合は true. 時間・数の上限や中断で止めた場合は false (そこまでの合計). */
  complete: boolean;
}

/**
 * 詳細の取得状況.
 */
export type InfoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; info: ItemInfo };

/**
 * 配下の合計の計算状況.
 */
export type StatsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stats: DirStats };
