/**
 * ツリーノード：ペインのディレクトリ配下の 1 ファイルまたはディレクトリ.
 */
export interface TreeNode {
  /** ファイルシステム上の絶対パス. */
  path: string;
  /** ファイル・ディレクトリの名前. */
  name: string;
  /** ディレクトリの場合は true. */
  is_dir: boolean;
  /** 展開済みの場合は true (ディレクトリのみ). */
  expanded: boolean;
  /** 子ノードを読み込み済みの場合は true (ディレクトリのみ). */
  loaded: boolean;
  /** 子ノード. 未読込の場合は空. ファイルの場合も常に空. */
  children: TreeNode[];
}

/**
 * フラット化したツリーの行：レンダリング用.
 */
export interface TreeRow {
  /** そのノード. */
  node: TreeNode;
  /** 深さ (インデント用): ルート直下は 0. */
  depth: number;
}
