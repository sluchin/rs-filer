import type { ReactElement } from "react";
import type { DiskSpace } from "../features/explorer/types";
import { formatDiskSize } from "../utils/formatters";

/**
 * StatusBar コンポーネントのプロパティ.
 */
interface StatusBarProps {
  /** 表示するエラーメッセージ. null の場合はカーソル位置の名前を表示する. */
  error: string | null;
  /** カーソル位置の項目の名前. */
  currentName: string;
  /** アクティブなペインのディスク容量. 不明な場合は null. */
  disk: DiskSpace | null;
}

/**
 * ステータスバー. 左にエラーまたはカーソル位置の名前, 右にディスクの空き容量を表示します.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ステータスバーのReact要素.
 */
export default function StatusBar({
  error,
  currentName,
  disk,
}: StatusBarProps): ReactElement {
  return (
    <div className="status-bar">
      {error ? (
        <span className="status-error">エラー: {error}</span>
      ) : (
        <span>{currentName}</span>
      )}
      {disk && (
        <span>
          Free: {formatDiskSize(disk.free)}, Total: {formatDiskSize(disk.total)}
        </span>
      )}
    </div>
  );
}
