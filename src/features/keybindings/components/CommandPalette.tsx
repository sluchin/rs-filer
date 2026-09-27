import { useState, type ReactElement } from "react";
import Minibuffer from "../../../components/Minibuffer";
import { commandNames, resolveCommandName } from "../commandNames";
import { commonPrefix } from "../../../utils/strings";

/** 一度に表示する候補の最大件数. */
const MAX_SUGGESTIONS = 20;

/**
 * CommandPalette コンポーネントのプロパティ.
 */
interface CommandPaletteProps {
  /** 入力中の文字列. */
  value: string;
  /** 入力中の文字列の変更ハンドラー. */
  onChange: (value: string) => void;
  /** コマンド名を実行するハンドラー. */
  onExecute: (name: string) => void;
  /** 履歴をたどるハンドラー (-1 で過去へ, 1 で現在に近い方へ). たどれない場合は何もしない. */
  onHistory: (delta: number) => void;
  /** 閉じるハンドラー. */
  onClose: () => void;
}

/** すべてのコマンド名 (名前順). */
const ALL_NAMES = commandNames();

/**
 * ミニバッファのコマンドパレット (`M-x` / `:`). コマンド名を入力して実行します.
 *
 * 候補の一覧は表示しません. `Tab` で, 前方一致する名前の共通する先頭部分まで補完し,
 * `Enter` で, 一致が 1 つならそれを, 入力そのものが名前として存在すればそれを実行します.
 * `↑` `↓` `M-p` `M-n` で, 過去に実行した名前を参照できます. コマンドの一覧は `help` (`?` キー) で見られます.
 *
 * @param props - コンポーネントのプロパティ.
 * @returns ダイアログのReact要素.
 */
export default function CommandPalette({
  value,
  onChange,
  onExecute,
  onHistory,
  onClose,
}: CommandPaletteProps): ReactElement {
  const [message, setMessage] = useState<string | null>(null);

  const matches = ALL_NAMES.filter((name) =>
    name.toLowerCase().startsWith(value.trim().toLowerCase()),
  ).slice(0, MAX_SUGGESTIONS);

  /**
   * 名前を実行します.
   */
  const execute = (name: string): void => {
    onExecute(name);
  };

  /**
   * 入力を確定します.
   */
  const submit = (): void => {
    const trimmed = value.trim();
    const exact = resolveCommandName(trimmed);
    if (exact !== null) {
      execute(trimmed);
    } else if (matches.length === 1) {
      execute(matches[0]);
    } else if (matches.length === 0) {
      setMessage("該当するコマンドがありません.");
    } else {
      setMessage(`${matches.length} 件が一致しています.`);
    }
  };

  return (
    <Minibuffer title="コマンドの実行" onClose={onClose}>
      <input
        type="text"
        aria-label="コマンド名"
        autoFocus
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setMessage(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const prefix = commonPrefix(matches);
            if (prefix.length > value.length) {
              onChange(prefix);
            }
          } else if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "ArrowUp" || (e.key === "p" && e.altKey)) {
            e.preventDefault();
            onHistory(-1);
          } else if (e.key === "ArrowDown" || (e.key === "n" && e.altKey)) {
            e.preventDefault();
            onHistory(1);
          }
        }}
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      {message && <p className="palette-message">{message}</p>}
    </Minibuffer>
  );
}
