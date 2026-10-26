import type { DiskSpace, FileEntry_Serialize } from "../../bindings";

/** ファイルシステム上の 1 つのエントリ (バックエンドから受け取る形). */
export type FileEntry = FileEntry_Serialize;

export type { DiskSpace };

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
   * 削除の印 (Emacs の Dired の `D`) を付けたエントリのパス. `x` で削除する. マークとは重ならない.
   */
  flags: string[];
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
