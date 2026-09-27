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
    };
