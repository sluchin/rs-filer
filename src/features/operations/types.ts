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

/**
 * 同名のディレクトリを統合するとき, 中にある同名のファイル 1 件.
 */
export interface NestedConflict {
  /** コピー・移動元のファイルの絶対パス (依頼の `skip` に渡す値). */
  source: string;
  /** 確認で表示する名前 (対象のディレクトリ名から始まる相対パス. 例: `d/sub/a.txt`). */
  label: string;
}

/**
 * コピー・移動・削除の種類.
 */
export type TransferKind = "copy" | "move" | "delete";

/**
 * バックエンドへ渡す, コピー・移動・削除の依頼.
 */
export interface TransferRequest {
  /**
   * 操作の種類.
   */
  kind: TransferKind;
  /**
   * 対象のパス.
   */
  sources: string[];
  /**
   * コピー・移動先のディレクトリ. 削除では null.
   */
  dest_dir: string | null;
  /**
   * true の場合, 同名のファイルを上書きする.
   */
  overwrite: boolean;
  /**
   * true の場合, 削除でゴミ箱を使わず完全に削除する.
   */
  permanent: boolean;
  /**
   * コピー時に指定した名前でコピーする (Copy のみ. 単一ファイルに限定).
   */
  dest_name?: string;
  /**
   * コピー・移動しないファイルのパス (同名のディレクトリを統合するとき, 上書きしないと答えたもの).
   * 移動では, 移動元に残る.
   */
  skip?: string[];
}

/**
 * コピー・移動・削除の進捗.
 */
export interface TransferProgress {
  /**
   * 処理済みの量. コピー・移動ではバイト数, 削除では件数.
   */
  done: number;
  /**
   * 全体の量. 単位は done と同じ.
   */
  total: number;
  /**
   * 処理中の項目の名前.
   */
  current: string;
}

/**
 * コピー・移動・削除の結果.
 */
export interface TransferSummary {
  /**
   * 最後まで処理した対象の数.
   */
  processed: number;
  /**
   * 中断された場合は true.
   */
  cancelled: boolean;
}

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
