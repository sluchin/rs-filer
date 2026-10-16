import type { ReactElement } from "react";
import type { TaskState, TransferKind } from "../types";

/** 操作の種類ごとの, 表示に使う動詞. */
const LABELS: Record<TransferKind, string> = {
  copy: "コピー中",
  move: "移動中",
  delete: "削除中",
};

/**
 * BackgroundTaskBar コンポーネントのプロパティ.
 */
interface BackgroundTaskBarProps {
  /** バックグラウンドで実行中の操作の状態. */
  task: TaskState;
  /** 中断のハンドラー. */
  onCancel: () => void;
}

/**
 * バックグラウンドで実行中の操作の進捗を, ステータスバーの上に 1 行で示します. 中断もできます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 進捗バーのReact要素.
 */
export default function BackgroundTaskBar({
  task,
  onCancel,
}: BackgroundTaskBarProps): ReactElement {
  return (
    <div
      className="status-bar"
      role="status"
      aria-label="バックグラウンドの処理"
    >
      <span className="status-main" title={task.current}>
        {LABELS[task.kind]}: {task.current || "準備中..."}
      </span>
      <progress
        aria-label="進捗"
        value={task.done}
        max={Math.max(task.total, 1)}
      />
      <button type="button" disabled={task.cancelling} onClick={onCancel}>
        {task.cancelling ? "中断しています..." : "中断"}
      </button>
    </div>
  );
}
