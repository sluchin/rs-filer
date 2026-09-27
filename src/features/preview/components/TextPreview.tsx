import type { ReactElement } from "react";
import { highlight, languageOf } from "../languages";

/**
 * TextPreview コンポーネントのプロパティ.
 */
interface TextPreviewProps {
  /** ファイル名 (拡張子で言語を決める). */
  name: string;
  /** 表示するテキスト. */
  text: string;
}

/**
 * テキストのプレビュー. 拡張子に対応する言語があれば, シンタックスハイライトします.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns テキストのReact要素.
 */
export default function TextPreview({
  name,
  text,
}: TextPreviewProps): ReactElement {
  const language = languageOf(name);
  return (
    <pre className="preview-text">
      {language ? (
        <code dangerouslySetInnerHTML={{ __html: highlight(text, language) }} />
      ) : (
        <code>{text}</code>
      )}
    </pre>
  );
}
