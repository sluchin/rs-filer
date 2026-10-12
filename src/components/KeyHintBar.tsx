import type { ReactElement } from "react";

/** 画面下部に表示するキー操作の案内. */
const HINTS: string[] = [
  "Tab:ペイン",
  "t:ツリー",
  "j/k:移動",
  "PgUp/PgDn:ページ",
  "Home/End:先頭/末尾",
  "Enter:開く",
  "h:親DIR",
  "g:パス",
  "M-d:ドライブ",
  "c:コピー",
  "m:移動",
  "O:同期",
  "v:プレビュー",
  "d:削除",
  "D:完全削除",
  "r:名前変更",
  "N:mkdir",
  "C-x C-f:新規ファイル",
  "x:実行",
  "e:編集",
  "R:リロード",
  "Space:マーク",
  "u:解除",
  "*:一括マーク",
  ".:隠し",
  "s:ソート",
  "i:詳細",
  "/:絞込",
  "b:ブックマーク",
  "M-←/→:履歴",
  "M-x/::コマンド",
  "?:ヘルプ",
  "H:ログ",
  "q:終了",
];

/** ツリー表示中に表示するキー操作の案内 (`TreePane.tsx` で処理するキー). */
const TREE_HINTS: string[] = [
  "Tab:ペイン",
  "j/k:移動",
  "→/l:展開",
  "←/h:折畳/親",
  "S-→/L:3階層展開",
  "S-←/H:全折畳",
  "Enter:開く",
  "x:実行",
  "N:mkdir",
  "+:根にmkdir",
  "r:名前変更",
  "d:削除",
  "D:完全削除",
  "t/Esc:戻る",
];

/**
 * KeyHintBar コンポーネントのプロパティ.
 */
interface KeyHintBarProps {
  /** 案内の種類. 通常のファイル一覧は `list`, アクティブなペインがツリー表示のときは `tree`. */
  mode?: "list" | "tree";
}

/**
 * キー操作の案内バー. xyzzy のファイラと同様に, 画面下部へ並べて表示します.
 *
 * 窓の幅が狭いときは, 案内と案内の間で折り返します (1 つの案内を, 途中で分けない).
 * アクティブなペインがツリー表示のときは, ツリーで使うキーの案内に切り替えます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 案内バーのReact要素.
 */
export default function KeyHintBar({
  mode = "list",
}: KeyHintBarProps): ReactElement {
  const hints = mode === "tree" ? TREE_HINTS : HINTS;
  return (
    <div className="key-hint-bar" data-mode={mode}>
      {hints.map((hint) => (
        <span key={hint} className="key-hint">
          {hint}
        </span>
      ))}
    </div>
  );
}
