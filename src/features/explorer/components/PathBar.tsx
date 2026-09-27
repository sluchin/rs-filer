import { useState } from "react";
import type { ChangeEvent, KeyboardEvent, ReactElement } from "react";

/**
 * PathBar コンポーネントのプロパティ.
 */
interface PathBarProps {
  /** 表示中のパス. */
  path: string;
  /** Enter 押下時のハンドラー. 入力中の文字列が渡される. */
  onSubmit: (value: string) => void;
  /** 入力欄の要素を受け取る ref コールバック. */
  inputRef: (element: HTMLInputElement | null) => void;
  /** 入力欄のアクセシブルな名前. */
  label: string;
}

/**
 * カレントパスの表示・直接入力バー. 入力中の文字列は, Enter で確定するまでペインの状態へ反映しません.
 * 呼び出し側は, 表示中のパスが変わったときに入力を作り直せるよう, パスを `key` に指定します.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 入力欄のReact要素.
 */
export default function PathBar({
  path,
  onSubmit,
  inputRef,
  label,
}: PathBarProps): ReactElement {
  const [draft, setDraft] = useState(path);

  return (
    <input
      type="text"
      ref={inputRef}
      aria-label={label}
      value={draft}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          onSubmit(draft);
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(path);
          e.currentTarget.blur();
        }
      }}
      className="path-bar"
    />
  );
}
