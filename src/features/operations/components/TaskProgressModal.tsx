import type { ReactElement } from "react";
import Modal from "../../../components/Modal";
import type { TaskState, TransferKind } from "../types";

/** 操作の種類ごとの, 見出し. */
const TITLES: Record<TransferKind, string> = {
  copy: "コピー中",
  move: "移動中",
  delete: "削除中",
};

/**
 * TaskProgressModal コンポーネントのプロパティ.
 */
interface TaskProgressModalProps {
  /** 実行中の操作の状態. */
  task: TaskState;
  /** 中断のハンドラー. */
  onCancel: () => void;
}

/**
 * コピー・移動・削除の進捗を示すダイアログ. `C-g` または `Esc` で中断します.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ダイアログのReact要素.
 */
export default function TaskProgressModal({
  task,
  onCancel,
}: TaskProgressModalProps): ReactElement {
  return (
    <Modal title={TITLES[task.kind]} onClose={onCancel}>
      <div
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key === "g") {
            e.preventDefault();
            onCancel();
          }
        }}
      >
        <p className="task-current">{task.current || "準備中..."}</p>
        <progress
          aria-label="進捗"
          className="task-progress"
          value={task.done}
          max={Math.max(task.total, 1)}
        />
        <div style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            autoFocus
            disabled={task.cancelling}
            onClick={onCancel}
          >
            {task.cancelling ? "中断しています..." : "中断 (C-g)"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
