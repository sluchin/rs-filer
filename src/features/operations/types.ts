/**
 * 操作の途中で表示するダイアログの状態.
 */
export type DialogState =
  | {
      /** 名前などを入力するダイアログ. */
      kind: "prompt";
      /** ダイアログの見出し. */
      title: string;
      /** 入力欄の初期値. */
      initialValue: string;
      /** 入力を確定したときの処理. */
      onSubmit: (value: string) => void;
    }
  | {
      /** はい/いいえで確認するダイアログ. */
      kind: "confirm";
      /** ダイアログの見出し. */
      title: string;
      /** 確認する内容. */
      message: string;
      /** 承諾したときの処理. */
      onConfirm: () => void;
    }
  | {
      /** 複数の選択肢から 1 つを, キーで選ぶダイアログ (例: はい / いいえ / 全て上書き). */
      kind: "choice";
      /** ダイアログの見出し. */
      title: string;
      /** 確認する内容. */
      message: string;
      /** 選択肢. `key` を押すと, その `run` を実行して, ダイアログを閉じる. */
      choices: ChoiceOption[];
    };

/**
 * 選択肢ダイアログの選択肢 1 つ.
 */
export interface ChoiceOption {
  /** 選ぶキー (1 文字. 例: `y`). */
  key: string;
  /** ボタンに表示する名前. */
  label: string;
  /** 選んだときの処理. */
  run: () => void;
}

import type {
  NestedConflict,
  TransferKind,
  TransferProgress,
  TransferRequest_Deserialize,
  TransferSummary,
} from "../../bindings";

/** 転送 (コピー・移動・削除) の要求 (バックエンドへ送る形). */
export type TransferRequest = TransferRequest_Deserialize;

export type { NestedConflict, TransferKind, TransferProgress, TransferSummary };

/**
 * 実行中の操作の状態.
 */
export interface TaskState extends TransferProgress {
  /**
   * 操作の種類.
   */
  kind: TransferKind;
  /**
   * 中断を要求済みの場合は true.
   */
  cancelling: boolean;
}
