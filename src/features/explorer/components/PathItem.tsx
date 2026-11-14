import type { ReactElement } from "react";
import { fileKind } from "../../../utils/fileKind";
import { getBaseName } from "../../../utils/path";
import FileIcon from "./FileIcon";

/**
 * PathItem コンポーネントのプロパティ.
 */
interface PathItemProps {
  /** 表示するパス (フルパス). */
  path: string;
  /** ディレクトリかどうか (アイコンの種類を決める). */
  isDir: boolean;
}

/**
 * パスの一覧 (最近開いたファイル, 移動履歴, ブックマーク) の 1 行の中身.
 *
 * Windows のエクスプローラの検索結果のように, アイコンとファイル名 (ディレクトリ名) を上に,
 * その下にフルパスを灰色で表示します. 行にカーソルを当てると, 名前とフルパスをポップアップ (ツールチップ) で
 * 表示します. ルートなど, 名前がないパスは, パスだけを 1 行で表示します.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 行の中身のReact要素.
 */
export default function PathItem({ path, isDir }: PathItemProps): ReactElement {
  const name = getBaseName(path);
  const label = name === "" ? path : name;
  return (
    <>
      <FileIcon kind={fileKind(label, isDir)} />
      <span
        className="path-item"
        title={name === "" ? path : `${name}\n${path}`}
      >
        {name === "" ? (
          <span className="full-path">{path}</span>
        ) : (
          <>
            <span className="path-item-name">{name}</span>
            <span className="full-path path-item-full">{path}</span>
          </>
        )}
      </span>
    </>
  );
}
