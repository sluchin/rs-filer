import type {
  DiskSpace,
  FileEntry_Serialize,
  SearchResult_Serialize,
} from "../../bindings";

/** ファイルシステム上の 1 つのエントリ (バックエンドから受け取る形). */
export type FileEntry = FileEntry_Serialize;

export type { DiskSpace };

/** 再帰検索の結果 (バックエンドから受け取る形). */
export type SearchResult = SearchResult_Serialize;

/** 再帰検索の種類. */
export type SearchKind = "name" | "content";

/**
 * 再帰検索の結果を表示しているときの情報. 検索を始めたディレクトリは, `PaneState.currentPath`.
 */
export interface SearchState {
  /** 検索の種類. 名前で探した (`find-name-dired`) か, ファイルの中身で探した (`find-grep-dired`) か. */
  kind: SearchKind;
  /** 検索した文字列 (名前の一部かワイルドカード, または正規表現). */
  query: string;
  /** 件数の上限に達して打ち切ったかどうか. */
  truncated: boolean;
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
   * 再帰検索の結果を表示しているときの情報. 表示していない場合は null. 表示中は, `allFiles` が検索の結果で,
   * 各項目の `name` は `currentPath` からの相対パス.
   */
  search: SearchState | null;
  /**
   * 移動したディレクトリの履歴.
   */
  history: string[];
  /**
   * 履歴の中の現在位置.
   */
  historyIndex: number;
}
