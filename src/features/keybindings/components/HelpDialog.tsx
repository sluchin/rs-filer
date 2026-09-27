import type { ReactElement } from "react";
import Modal from "../../../components/Modal";
import { COMMAND_DESCRIPTIONS } from "../commandNames";
import { reverseKeymap, type Keymap } from "../keymap";
import type { Command } from "../types";

/**
 * HelpDialog コンポーネントのプロパティ.
 */
interface HelpDialogProps {
  /** 表示するキーマップ (ユーザー設定を反映済みのもの). */
  keymap: Keymap;
  /** 閉じるハンドラー. */
  onClose: () => void;
}

/** コマンド名の別名 (キーマップには現れないため, 固定で案内する). */
const ALIASES: [string, Command][] = [
  ["refresh", "reload"],
  ["find", "filter"],
  ["up", "parent"],
  ["exit", "quit"],
];

/**
 * コマンド一覧のダイアログ (`:help` / `?`). 割り当てられているキーと説明を表示します.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ダイアログのReact要素.
 */
export default function HelpDialog({
  keymap,
  onClose,
}: HelpDialogProps): ReactElement {
  const keysByCommand = reverseKeymap(keymap);
  const commands = Object.keys(COMMAND_DESCRIPTIONS) as Command[];

  return (
    <Modal title="コマンド一覧" onClose={onClose}>
      <div className="help-table-scroll">
        <table className="help-table">
          <thead>
            <tr>
              <th>キー</th>
              <th>コマンド</th>
              <th>説明</th>
            </tr>
          </thead>
          <tbody>
            {commands.map((command) => (
              <tr key={command}>
                <td>{(keysByCommand[command] ?? []).join(" / ")}</td>
                <td>{command}</td>
                <td>{COMMAND_DESCRIPTIONS[command]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="help-aliases">
        別名 (コマンドパレットで入力可):{" "}
        {ALIASES.map(([alias, command]) => `${alias}→${command}`).join(", ")}
      </p>
      <button type="button" autoFocus onClick={onClose}>
        閉じる
      </button>
    </Modal>
  );
}
