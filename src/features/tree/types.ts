/**
 * ツリーノード：ペインのディレクトリ配下の 1 ディレクトリ.
 */
export interface TreeNode {
  /** ファイルシステム上の絶対パス. */
  path: string;
  /** ディレクトリの名前. */
  name: string;
  /** 展開済みの場合は true. */
  expanded: boolean;
  /** 子ノードを読み込み済みの場合は true. */
  loaded: boolean;
  /** 子ノード. 未読込の場合は空. */
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
