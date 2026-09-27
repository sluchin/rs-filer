import type { ReactElement } from "react";
import type { LogEntry } from "../hooks/useOperationLog";
import Modal from "./Modal";

/**
 * OperationLogDialog コンポーネントのプロパティ.
 */
interface OperationLogDialogProps {
  /** 表示するログ. 新しいものが後ろ. */
  entries: LogEntry[];
  /** 閉じるハンドラー. */
  onClose: () => void;
}

/**
 * 時刻を `HH:MM:SS` に整形します.
 */
function formatTime(time: number): string {
  const d = new Date(time);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

/**
 * 操作ログのダイアログ. 新しいものを上に並べます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ダイアログのReact要素.
 */
export default function OperationLogDialog({
  entries,
  onClose,
}: OperationLogDialogProps): ReactElement {
  return (
    <Modal title="操作ログ" onClose={onClose}>
      <ul className="operation-log">
        {entries.length === 0 && <li>ログはありません.</li>}
        {[...entries].reverse().map((entry, index) => (
          <li key={index} data-level={entry.level}>
            {formatTime(entry.time)} {entry.message}
          </li>
        ))}
      </ul>
      <button type="button" autoFocus onClick={onClose}>
        閉じる
      </button>
    </Modal>
  );
}
