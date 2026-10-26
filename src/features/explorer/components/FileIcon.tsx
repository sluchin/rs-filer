import type { ReactElement } from "react";
import type { FileKind } from "../../../utils/fileKind";

/**
 * FileIcon コンポーネントのプロパティ.
 */
interface FileIconProps {
  /** アイコンの種類 (`utils/fileKind.ts` の `fileKind` で, 名前から決める). */
  kind: FileKind;
}

/** 書類の形 (右上を折った紙) の輪郭. */
const PAGE = "M3.5 1.5h6l3 3v10h-9z";
/** 書類の右上の折り返し. */
const FOLD = "M9.5 1.5v3h3";

/**
 * 書類の形の上に, 種類ごとの絵を描きます.
 *
 * @param props - 紙の色 (`paper`), 枠の色 (`edge`), 中の絵 (`children`).
 * @returns SVG の要素.
 */
function Page({
  paper = "#ffffff",
  edge = "#6b7785",
  children,
}: {
  paper?: string;
  edge?: string;
  children?: ReactElement | ReactElement[];
}): ReactElement {
  return (
    <>
      <path d={PAGE} fill={paper} stroke={edge} strokeLinejoin="round" />
      <path d={FOLD} fill="#dde3ea" stroke={edge} strokeLinejoin="round" />
      {children}
    </>
  );
}

/**
 * 種類ごとの絵 (16px の SVG の中身).
 *
 * @param kind - アイコンの種類.
 * @returns SVG の要素.
 */
function Glyph({ kind }: { kind: FileKind }): ReactElement {
  switch (kind) {
    case "dir":
      return (
        <>
          <path
            d="M1.5 3.5h4l1.5 1.5h7.5v8.5h-13z"
            fill="#e0b040"
            stroke="#a67c00"
            strokeLinejoin="round"
          />
          <path
            d="M1.5 6.5h13v7h-13z"
            fill="#fbe08a"
            stroke="#a67c00"
            strokeLinejoin="round"
          />
        </>
      );
    case "parent":
      return (
        <path
          d="M8 1.5 2.5 7H6v3.5c0 1.5 1 2.5 2.5 2.5H13v-2.5H9.5c-.3 0-.5-.2-.5-.5V7h3.5z"
          fill="#3fae4a"
          stroke="#1f7a2a"
          strokeLinejoin="round"
        />
      );
    case "image":
      // 山と太陽
      return (
        <Page edge="#3d7ab8">
          <circle cx="6.5" cy="7" r="1.2" fill="#f2b400" />
          <path d="M4.5 13.5l3-4 2 2.5 1.5-1.5 1.5 3z" fill="#3fae4a" />
        </Page>
      );
    case "video":
      // 再生の三角
      return (
        <Page edge="#7a4bb5">
          <path d="M6 7v5l4.5-2.5z" fill="#7a4bb5" />
        </Page>
      );
    case "audio":
      // 音符
      return (
        <Page edge="#d9730d">
          <path d="M7.5 12V7.5l3.5-1v4" stroke="#d9730d" fill="none" />
          <circle cx="6.5" cy="12" r="1.2" fill="#d9730d" />
          <circle cx="10" cy="10.8" r="1.2" fill="#d9730d" />
        </Page>
      );
    case "archive":
      // ファスナー
      return (
        <Page paper="#f3e3c3" edge="#8a5a2b">
          <path d="M7.5 2v1h1v1h-1v1h1v1h-1v1h1" stroke="#8a5a2b" fill="none" />
          <rect x="6.5" y="8.5" width="3" height="3" fill="#8a5a2b" />
        </Page>
      );
    case "pdf":
      // 赤い帯
      return (
        <Page edge="#c62828">
          <rect x="3.5" y="9" width="9" height="4" fill="#c62828" />
          <path d="M5.5 6.5h5" stroke="#9aa5b1" />
        </Page>
      );
    case "document":
      // 青い帯と行
      return (
        <Page edge="#2b5797">
          <rect x="3.5" y="5" width="6" height="1.5" fill="#2b5797" />
          <path d="M5.5 8.5h5M5.5 10.5h5M5.5 12.5h3" stroke="#2b5797" />
        </Page>
      );
    case "spreadsheet":
      // 緑の表
      return (
        <Page edge="#1e7145">
          <path
            d="M5 7h6v6H5zM5 9h6M5 11h6M8 7v6"
            stroke="#1e7145"
            fill="none"
          />
        </Page>
      );
    case "presentation":
      // 橙のスライドと棒
      return (
        <Page edge="#c55a11">
          <rect x="5" y="7" width="6" height="4.5" fill="#f4b183" />
          <path d="M6.5 10.5v-1M8 10.5v-2M9.5 10.5V8" stroke="#c55a11" />
        </Page>
      );
    case "code":
      // < >
      return (
        <Page edge="#5c6bc0">
          <path
            d="M6.5 7.5 5 9.5l1.5 2M9.5 7.5l1.5 2-1.5 2"
            stroke="#5c6bc0"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Page>
      );
    case "script":
      // 端末の >_
      return (
        <Page paper="#37474f" edge="#263238">
          <path
            d="M5.5 7.5 7 9l-1.5 1.5M8 11.5h3"
            stroke="#a5d6a7"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Page>
      );
    case "executable":
      // 窓と歯車の代わりの, 実行の印 (四角の中の三角)
      return (
        <>
          <rect
            x="1.5"
            y="2.5"
            width="13"
            height="11"
            rx="1"
            fill="#eceff1"
            stroke="#455a64"
          />
          <path d="M1.5 5.5h13" stroke="#455a64" />
          <path d="M6.5 7.5v4l3.5-2z" fill="#2e7d32" />
        </>
      );
    case "config":
      // 歯車
      return (
        <Page edge="#607d8b">
          <circle
            cx="8"
            cy="10"
            r="2.2"
            fill="none"
            stroke="#607d8b"
            strokeWidth="1.5"
            strokeDasharray="1.2 0.8"
          />
          <circle cx="8" cy="10" r="0.8" fill="#607d8b" />
        </Page>
      );
    case "text":
      // 行
      return (
        <Page>
          <path d="M5.5 7.5h5M5.5 9.5h5M5.5 11.5h5" stroke="#9aa5b1" />
        </Page>
      );
    case "font":
      // 文字の A
      return (
        <Page edge="#8e24aa">
          <path
            d="M5.5 12.5 8 6.5l2.5 6M6.5 10.5h3"
            stroke="#8e24aa"
            fill="none"
            strokeLinejoin="round"
          />
        </Page>
      );
    case "file":
      return <Page />;
  }
}

/**
 * ファイル一覧とツリーの行頭に表示する 16px のアイコン.
 * ディレクトリ, 親ディレクトリ (`..`) の矢印と, ファイルの種類 (画像, 動画, 音声, 圧縮, PDF, 文書, 表計算,
 * プレゼンテーション, ソースコード, スクリプト, 実行ファイル, 設定, テキスト, フォント, そのほか) ごとの絵を描きます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns SVG のReact要素.
 */
export default function FileIcon({ kind }: FileIconProps): ReactElement {
  return (
    <svg
      className="file-icon"
      data-icon={kind}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <Glyph kind={kind} />
    </svg>
  );
}
