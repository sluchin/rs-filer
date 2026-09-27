/**
 * バックエンドが返すプレビューの内容. 種類ごとに, 使う項目だけを持つ.
 */
export type Preview = {
  /**
   * ファイルのサイズ (バイト).
   */
  size: number;
  /**
   * 先頭部分だけを読み込んだ場合は true.
   */
  truncated: boolean;
} & (
  | {
      kind: "text";
      /**
       * テキストの文字コード.
       */
      encoding: string;
      /**
       * テキスト.
       */
      text: string;
    }
  | {
      kind: "image";
      /**
       * 画像の data URL.
       */
      data_url: string;
    }
  | {
      kind: "binary";
      /**
       * 16 進ダンプ.
       */
      text: string;
    }
);

/**
 * プレビューの取得状況.
 */
export type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; preview: Preview };
