import type { ReactElement } from "react";
import Minibuffer from "../../../components/Minibuffer";

/**
 * DriveSelector コンポーネントのプロパティ.
 */
interface DriveSelectorProps {
  /** 選べるドライブのルートパス. */
  drives: string[];
  /** ドライブを選んだときのハンドラー. */
  onSelect: (root: string) => void;
  /** 閉じるハンドラー. */
  onClose: () => void;
}

/**
 * ドライブ切り替えダイアログ.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ダイアログのReact要素.
 */
export default function DriveSelector({
  drives,
  onSelect,
  onClose,
}: DriveSelectorProps): ReactElement {
  return (
    <Minibuffer title="ドライブの選択" onClose={onClose}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {drives.map((root, index) => (
          <button
            key={root}
            type="button"
            autoFocus={index === 0}
            onClick={() => onSelect(root)}
          >
            {root}
          </button>
        ))}
      </div>
    </Minibuffer>
  );
}
