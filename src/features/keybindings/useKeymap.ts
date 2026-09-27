import { useEffect, useRef, useState } from "react";
import { resolveKey, type Keymap } from "./keymap";
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
 * @param keymap - 使うキーマップ.
 * @returns 入力途中のキーの並び (`C-x` など). 途中でない場合は null.
 */
export function useKeymap(
  onCommand: (command: Command) => void,
  enabled: boolean,
  keymap: Keymap,
): string | null {
  const onCommandRef = useRef(onCommand);
  const prefixRef = useRef<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (isTextInput(e.target)) {
        return;
      }
      const { command, prefix } = resolveKey(e, prefixRef.current, keymap);
      // 修飾キー単独の入力は, 途中のキーの並びに影響しない.
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) {
        return;
      }
      prefixRef.current = prefix ?? null;
      setPending(prefix ?? null);
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
      setPending(null);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, keymap]);

  return pending;
}
