import type { ReactElement } from "react";

/**
 * QuickFilterBar コンポーネントのプロパティ.
 */
interface QuickFilterBarProps {
  /** 絞り込み文字列. */
  value: string;
  /** 絞り込み文字列の変更ハンドラー. */
  onChange: (value: string) => void;
  /** 絞り込みを解除するハンドラー (Esc). */
  onCancel: () => void;
  /** 入力欄の要素を受け取る ref コールバック. */
  inputRef: (element: HTMLInputElement | null) => void;
  /** 入力欄のアクセシブルな名前. */
  label: string;
}

/**
 * ペイン内の名前の絞り込み入力欄. 入力するたびに一覧が絞り込まれます.
 * `Enter` で入力を終えて一覧の操作へ戻り (絞り込みは維持), `Esc` で絞り込みを解除します.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 入力欄のReact要素.
 */
export default function QuickFilterBar({
  value,
  onChange,
  onCancel,
  inputRef,
  label,
}: QuickFilterBarProps): ReactElement {
  return (
    <div className="filter-bar">
      <span>/</span>
      <input
        type="text"
        ref={inputRef}
        aria-label={label}
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            onCancel();
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
