import { useEffect, useRef } from "react";
import { resolveKey } from "./keymap";
import type { Command } from "./types";

/**
 * 入力欄など, 文字入力を優先すべき要素かどうかを返します.
 *
 * @param target - キーイベントの発生元.
 * @returns 文字入力を優先すべき要素なら true.
 */
function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/**
 * キー入力をコマンドに変換して実行するフック. `C-x` などのプレフィクスキーの状態も管理します.
 *
 * @param onCommand - コマンドを実行するハンドラー.
 * @param enabled - false の間 (ダイアログ表示中など) はキー入力を処理しない.
 */
export function useKeymap(
  onCommand: (command: Command) => void,
  enabled: boolean,
): void {
  const onCommandRef = useRef(onCommand);
  const prefixRef = useRef<string | null>(null);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (
        isTextInput(e.target) ||
        ["Shift", "Control", "Alt"].includes(e.key)
      ) {
        return;
      }
      const { command, prefix } = resolveKey(e, prefixRef.current);
      prefixRef.current = prefix ?? null;
      if (command === undefined && prefix === undefined) {
        return;
      }
      e.preventDefault();
      if (command !== undefined) {
        onCommandRef.current(command);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      prefixRef.current = null;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled]);
}
