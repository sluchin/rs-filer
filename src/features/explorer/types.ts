/**
 * ファイルまたはディレクトリのエントリ情報を表すインターフェース.
 */
export interface FileEntry {
  /**
   * ファイルまたはディレクトリの名前.
   */
  name: string;
  /**
   * ファイルシステム上の絶対パス.
   */
  path: string;
  /**
   * ディレクトリである場合は true, ファイルの場合は false.
   */
  is_dir: boolean;
  /**
   * ファイルサイズ (バイト). ディレクトリでは意味を持たない.
   */
  size: number;
  /**
   * 最終更新日時 (UNIX 時刻の秒). 取得できない場合は null.
   */
  modified: number | null;
  /**
   * 読み取り専用の場合は true.
   */
  readonly: boolean;
  /**
   * 隠しファイルの場合は true.
   */
  hidden: boolean;
}

/**
 * ディスクの空き容量と全体の容量.
 */
export interface DiskSpace {
  /**
   * 利用可能な空き容量 (バイト).
   */
  free: number;
  /**
   * 全体の容量 (バイト).
   */
  total: number;
}

/**
 * 操作対象ペインを識別するための識別子型.
 */
export type PaneId = "left" | "right";

/**
 * ソートの基準.
 */
export type SortKey = "name" | "ext" | "size" | "date";

/**
 * ソートの設定.
 */
export interface SortOption {
  /**
   * ソートの基準.
   */
  key: SortKey;
  /**
   * true の場合は降順.
   */
  desc: boolean;
}

/**
 * 各ペインの表示状態を管理するインターフェース.
 */
export interface PaneState {
  /**
   * 現在表示しているディレクトリの絶対パス.
   */
  currentPath: string;
  /**
   * 表示中のファイルおよびディレクトリの一覧 (隠しファイルの除外, 絞り込み, ソートを適用済み).
   */
  files: FileEntry[];
  /**
   * 現在のディレクトリ内に存在するすべてのエントリ (バックエンドから取得したまま).
   */
  allFiles: FileEntry[];
  /**
   * 現在フォーカスまたは選択されている項目のインデックス. -1 は親ディレクトリの行 (`..`).
   */
  selectedIndex: number;
  /**
   * マークしているエントリのパス.
   */
  marks: string[];
  /**
   * 隠しファイルを表示するかどうか.
   */
  showHidden: boolean;
  /**
   * サイズ・更新日時・属性の列を表示するかどうか.
   */
  showDetails: boolean;
  /**
   * ソートの設定.
   */
  sort: SortOption;
  /**
   * 名前の絞り込み文字列. 絞り込み中でない場合は null.
   */
  filter: string | null;
  /**
   * 移動したディレクトリの履歴.
   */
  history: string[];
  /**
   * 履歴の中の現在位置.
   */
  historyIndex: number;
}
