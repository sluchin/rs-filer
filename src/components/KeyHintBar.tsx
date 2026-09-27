import type { ReactElement } from "react";

/** 画面下部に表示するキー操作の案内. */
const HINTS: string[] = [
  "Tab:ペイン",
  "j/k:移動",
  "Enter:開く",
  "h:親DIR",
  "g:パス",
  "M-d:ドライブ",
  "c:コピー",
  "d:削除",
  "D:完全削除",
  "r:名前変更",
  "N:mkdir",
  "C-x C-f:新規ファイル",
  "x:実行",
  "e:編集",
  "R:リロード",
];

/**
 * キー操作の案内バー. xyzzy のファイラと同様に, 画面下部へ並べて表示します.
 *
 * @returns 案内バーのReact要素.
 */
export default function KeyHintBar(): ReactElement {
  return <div className="key-hint-bar">{HINTS.join(" ")}</div>;
}
