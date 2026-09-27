import type { ReactElement, ReactNode } from "react";

/**
 * Modal コンポーネントのプロパティ.
 */
interface ModalProps {
  /** 見出し. */
  title: string;
  /** 閉じる要求 (Esc キーまたは枠外クリック) のハンドラー. */
  onClose: () => void;
  /** 本文. */
  children: ReactNode;
}

/**
 * 画面中央に表示する汎用モーダル枠. Esc キーで閉じます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns モーダルのReact要素.
 */
export default function Modal({
  title,
  onClose,
  children,
}: ModalProps): ReactElement {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        style={{
          background: "#ffffff",
          border: "1px solid #999",
          borderRadius: "4px",
          padding: "1rem",
          minWidth: "20rem",
          maxWidth: "80vw",
        }}
      >
        <h2 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
