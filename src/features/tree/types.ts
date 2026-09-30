/**
 * ツリーノード：ディレクトリ階層を表現します.
 */
export interface TreeNode {
  /** ファイルシステム上の絶対パス. */
  path: string;
  /** ディレクトリ名. */
  name: string;
  /** 展開済みの場合は true. */
  expanded: boolean;
  /** 子ノードを読み込み済みの場合は true (API 呼び出しから戻ったら立てる). */
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
  /** 深さ (インデント用): ルートは 0. */
  depth: number;
}
