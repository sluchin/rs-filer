import type { ReactElement } from "react";

/**
 * BinaryPreview コンポーネントのプロパティ.
 */
interface BinaryPreviewProps {
  /** 16 進ダンプ. */
  dump: string;
}

/**
 * バイナリのプレビュー (16 進ダンプ).
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ダンプのReact要素.
 */
export default function BinaryPreview({
  dump,
}: BinaryPreviewProps): ReactElement {
  return <pre className="preview-text">{dump}</pre>;
}
