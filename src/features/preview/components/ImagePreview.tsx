import type { ReactElement } from "react";

/**
 * ImagePreview コンポーネントのプロパティ.
 */
interface ImagePreviewProps {
  /** ファイル名. */
  name: string;
  /** 画像の data URL. */
  dataUrl: string;
}

/**
 * 画像のプレビュー. 表示領域に収まるように縮小します.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 画像のReact要素.
 */
export default function ImagePreview({
  name,
  dataUrl,
}: ImagePreviewProps): ReactElement {
  return (
    <div className="preview-image">
      <img src={dataUrl} alt={name} />
    </div>
  );
}
