/**
 * ツリーノード：ペインのディレクトリ配下の 1 ディレクトリまたは 1 ファイル.
 */
export interface TreeNode {
  /** ファイルシステム上の絶対パス. */
  path: string;
  /** ディレクトリまたはファイルの名前. */
  name: string;
  /** ディレクトリの場合は true, ファイルの場合は false. ファイルは展開できない (子を持たない). */
  isDir: boolean;
  /** 配下にディレクトリもファイルも無いと分かっている場合は true. 展開マークを表示しない. 不明な間は false. */
  empty: boolean;
  /** 展開済みの場合は true. ファイルでは常に false. */
  expanded: boolean;
  /** 子ノードを読み込み済みの場合は true. ファイルでは常に false. */
  loaded: boolean;
  /** 子ノード. 未読込の場合とファイルでは空. */
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
