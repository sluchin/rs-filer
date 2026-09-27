import type { ReactElement } from "react";

/**
 * FileIcon コンポーネントのプロパティ.
 */
interface FileIconProps {
  /** アイコンの種類. ディレクトリ, ファイル, 親ディレクトリ (`..`). */
  kind: "dir" | "file" | "parent";
}

/**
 * ファイル一覧の行頭に表示する 16px のアイコン (フォルダ・書類・親ディレクトリの矢印).
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
      {kind === "dir" && (
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
      )}
      {kind === "file" && (
        <>
          <path
            d="M3.5 1.5h6l3 3v10h-9z"
            fill="#ffffff"
            stroke="#6b7785"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 1.5v3h3"
            fill="#dde3ea"
            stroke="#6b7785"
            strokeLinejoin="round"
          />
          <path d="M5.5 7.5h5M5.5 9.5h5M5.5 11.5h5" stroke="#9aa5b1" />
        </>
      )}
      {kind === "parent" && (
        <path
          d="M8 1.5 2.5 7H6v3.5c0 1.5 1 2.5 2.5 2.5H13v-2.5H9.5c-.3 0-.5-.2-.5-.5V7h3.5z"
          fill="#3fae4a"
          stroke="#1f7a2a"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
