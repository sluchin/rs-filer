import type { ReactElement, ReactNode } from "react";

/**
 * Minibuffer コンポーネントのプロパティ.
 */
interface MinibufferProps {
  /** 見出し. */
  title: string;
  /** 閉じる要求 (Esc キー) のハンドラー. */
  onClose: () => void;
  /** 本文. */
  children: ReactNode;
}

/**
 * 画面 (パイン領域) の下部に表示する, xyzzy/Emacs のミニバッファ風の入力領域.
 *
 * 中央にポップアップするダイアログとは異なり, キーヒントバー・ステータスバーの上に
 * 1 段追加される形で表示します. Esc キーで閉じます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ミニバッファのReact要素.
 */
export default function Minibuffer({
  title,
  onClose,
  children,
}: MinibufferProps): ReactElement {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="minibuffer"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <span className="minibuffer-title">{title}</span>
      <div className="minibuffer-body">{children}</div>
    </div>
  );
}
