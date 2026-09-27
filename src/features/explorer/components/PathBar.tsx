import type { ChangeEvent, KeyboardEvent, ReactElement } from "react";

/**
 * PathBar コンポーネントのプロパティ.
 */
interface PathBarProps {
  /** 表示中のパス. */
  path: string;
  /** パス変更時のハンドラー. */
  onChange: (value: string) => void;
  /** Enter 押下時のハンドラー. */
  onSubmit: () => void;
  /** 入力欄の要素を受け取る ref コールバック. */
  inputRef: (element: HTMLInputElement | null) => void;
  /** 入力欄のアクセシブルな名前. */
  label: string;
}

/**
 * カレントパスの表示・直接入力バー.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 入力欄のReact要素.
 */
export default function PathBar({
  path,
  onChange,
  onSubmit,
  inputRef,
  label,
}: PathBarProps): ReactElement {
  return (
    <input
      type="text"
      ref={inputRef}
      aria-label={label}
      value={path}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          onSubmit();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.currentTarget.blur();
        }
      }}
      className="path-bar"
    />
  );
}
