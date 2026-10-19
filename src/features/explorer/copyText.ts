/**
 * 文字としてコピーする対象 (ファイル一覧やツリーの 1 行).
 */
export interface CopyTarget {
  /** 絶対パス. */
  path: string;
  /** 名前. */
  name: string;
  /** ディレクトリである場合は true. */
  isDir: boolean;
}

/**
 * コピーの種類. `fullPath` はフルパス, `name` はファイル名 (ディレクトリならディレクトリ名).
 */
export type CopyKind = "fullPath" | "name";

/**
 * 右クリックのメニューの 1 項目.
 */
export interface CopyChoice {
  /** コピーの種類. */
  kind: CopyKind;
  /** メニューに表示する文字列. */
  label: string;
}

/**
 * 対象をコピーするときの文字列を返します.
 *
 * @param target - 対象.
 * @param kind - コピーの種類.
 * @returns フルパス, または名前.
 */
export function copyTextOf(target: CopyTarget, kind: CopyKind): string {
  return kind === "fullPath" ? target.path : target.name;
}

/**
 * 右クリックのメニューの項目を返します (名前の項目は, ファイルなら「ファイル名」, ディレクトリなら「ディレクトリ名」).
 *
 * @param target - 対象.
 * @returns メニューの項目.
 */
export function copyChoicesOf(target: CopyTarget): CopyChoice[] {
  return [
    { kind: "fullPath", label: "フルパスをコピー" },
    {
      kind: "name",
      label: target.isDir ? "ディレクトリ名をコピー" : "ファイル名をコピー",
    },
  ];
}
