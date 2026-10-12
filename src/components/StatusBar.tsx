import type { ReactElement } from "react";
import type { DiskSpace } from "../features/explorer/types";
import { formatDiskSize } from "../utils/formatters";

/**
 * StatusBar コンポーネントのプロパティ.
 */
interface StatusBarProps {
  /** 表示するエラーメッセージ. null の場合は通知またはカーソル位置の名前を表示する. */
  error: string | null;
  /** 完了などの通知. 無い場合は null. */
  notice: string | null;
  /** カーソル位置の項目の名前. */
  currentName: string;
  /** ソート・マークなどの状態の表示. */
  info: string;
  /** アクティブなペインのディスク容量. 不明な場合は null. */
  disk: DiskSpace | null;
}

/**
 * ステータスバー. 左にエラー・通知・カーソル位置の名前 (この順に優先), 中央にソート・マークの状態, 右にディスクの空き容量を表示します.
 *
 * 1 行に収めます. 幅が足りないときは, 右のディスク容量を残して, 中央の状態, 左の順に「…」で省略します.
 * 省略されても全体を確認できるよう, 左と中央には, ツールチップ (`title`) を付けます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ステータスバーのReact要素.
 */
export default function StatusBar({
  error,
  currentName,
  notice,
  info,
  disk,
}: StatusBarProps): ReactElement {
  const main = error ? `エラー: ${error}` : (notice ?? currentName);
  return (
    <div className="status-bar">
      <span
        className={error ? "status-main status-error" : "status-main"}
        title={main}
      >
        {main}
      </span>
      <span className="status-info" title={info}>
        {info}
      </span>
      {disk && (
        <span className="status-disk">
          Free: {formatDiskSize(disk.free)}, Total: {formatDiskSize(disk.total)}
        </span>
      )}
    </div>
  );
}
