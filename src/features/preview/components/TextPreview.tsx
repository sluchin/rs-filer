import type { ReactElement, ReactNode } from "react";
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
 * DOM ノードを安全な React ノードに再帰的に変換します.
 *
 * highlight.js が生成する `<span>` 要素 (かつ `hljs-` で始まるクラス名) のみ要素として残し,
 * それ以外はテキストとして扱うことで, `dangerouslySetInnerHTML` を使わずに安全に描画します.
 *
 * @param node - 変換対象の DOM ノード.
 * @param key - React の key.
 * @returns React ノード.
 */
function nodeToReact(node: Node, key: number | string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    const children = Array.from(element.childNodes).map((child, i) =>
      nodeToReact(child, i),
    );
    if (element.tagName.toLowerCase() === "span") {
      const safeClasses = element.className
        .split(/\s+/)
        .filter((cls) => /^hljs-[a-zA-Z0-9_-]+$/.test(cls));
      if (safeClasses.length > 0) {
        return (
          <span key={key} className={safeClasses.join(" ")}>
            {children}
          </span>
        );
      }
    }
    return children;
  }
  return null;
}

/**
 * highlight.js が生成した HTML 文字列を, 安全な React 要素の配列に変換します.
 *
 * @param html - シンタックスハイライト済みの HTML 文字列.
 * @returns 安全な React 要素の配列.
 */
export function renderHighlighted(html: string): ReactNode[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return Array.from(doc.body.childNodes).map((node, i) => nodeToReact(node, i));
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
        <code>{renderHighlighted(highlight(text, language))}</code>
      ) : (
        <code>{text}</code>
      )}
    </pre>
  );
}
