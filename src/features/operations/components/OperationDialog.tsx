import { useState, type FormEvent, type ReactElement } from "react";
import Minibuffer from "../../../components/Minibuffer";
import type { DialogState } from "../types";

/**
 * OperationDialog コンポーネントのプロパティ.
 */
interface OperationDialogProps {
  /** 表示するダイアログの状態. */
  dialog: DialogState;
  /** ダイアログを閉じるハンドラー. */
  onClose: () => void;
}

/**
 * 入力ダイアログ. 名前の入力を求めます.
 */
function PromptBody({
  dialog,
  onClose,
}: {
  dialog: Extract<DialogState, { kind: "prompt" }>;
  onClose: () => void;
}): ReactElement {
  const [value, setValue] = useState(dialog.initialValue);
  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    dialog.onSubmit(value);
  };
  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem" }}>
      <input
        type="text"
        aria-label="名前"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        style={{ flex: 1, padding: "0.25rem 0.4rem" }}
      />
      <button type="submit">OK</button>
      <button type="button" onClick={onClose}>
        キャンセル
      </button>
    </form>
  );
}

/**
 * 確認ダイアログ. `y` で承諾, `n` で取り消します.
 */
function ConfirmBody({
  dialog,
  onClose,
}: {
  dialog: Extract<DialogState, { kind: "confirm" }>;
  onClose: () => void;
}): ReactElement {
  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "y") {
          dialog.onConfirm();
        } else if (e.key === "n") {
          onClose();
        }
      }}
    >
      <p style={{ margin: "0 0 0.75rem 0" }}>{dialog.message}</p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" autoFocus onClick={dialog.onConfirm}>
          はい
        </button>
        <button type="button" onClick={onClose}>
          いいえ
        </button>
      </div>
    </div>
  );
}

/**
 * 操作の途中で表示する入力・確認ダイアログ.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ダイアログのReact要素.
 */
export default function OperationDialog({
  dialog,
  onClose,
}: OperationDialogProps): ReactElement {
  return (
    <Minibuffer title={dialog.title} onClose={onClose}>
      {dialog.kind === "prompt" ? (
        <PromptBody dialog={dialog} onClose={onClose} />
      ) : (
        <ConfirmBody dialog={dialog} onClose={onClose} />
      )}
    </Minibuffer>
  );
}
