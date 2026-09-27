import type { ReactElement } from "react";
import { formatDiskSize } from "../../../utils/formatters";
import type { PreviewState } from "../types";
import BinaryPreview from "./BinaryPreview";
import ImagePreview from "./ImagePreview";
import TextPreview from "./TextPreview";

/**
 * PreviewPane コンポーネントのプロパティ.
 */
interface PreviewPaneProps {
  /** プレビュー対象の名前. 対象が無い場合は空文字. */
  name: string;
  /** プレビューの取得状況. */
  state: PreviewState;
}

/**
 * プレビューの本体を, 状況と種類に応じて表示します.
 */
function Body({ name, state }: PreviewPaneProps): ReactElement {
  if (state.status === "idle") {
    return <p className="preview-message">プレビューできる項目がありません.</p>;
  }
  if (state.status === "loading") {
    return <p className="preview-message">読み込み中...</p>;
  }
  if (state.status === "error") {
    return <p className="preview-message">{state.message}</p>;
  }
  const { preview } = state;
  if (preview.kind === "image") {
    return <ImagePreview name={name} dataUrl={preview.data_url} />;
  }
  if (preview.kind === "binary") {
    return <BinaryPreview dump={preview.text} />;
  }
  return <TextPreview name={name} text={preview.text} />;
}

/**
 * ファイルのプレビューを表示するペイン. 反対側のペインの場所に表示されます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns プレビューのReact要素.
 */
export default function PreviewPane({
  name,
  state,
}: PreviewPaneProps): ReactElement {
  const info =
    state.status === "ready"
      ? [
          state.preview.kind === "text" ? state.preview.encoding : null,
          formatDiskSize(state.preview.size),
          state.preview.truncated ? "先頭のみ" : null,
        ]
          .filter(Boolean)
          .join(" / ")
      : "";
  return (
    <div role="region" aria-label="preview pane" className="pane preview-pane">
      <div className="preview-header">
        <span>{name}</span>
        <span>{info}</span>
      </div>
      <div className="preview-body">
        <Body name={name} state={state} />
      </div>
    </div>
  );
}
