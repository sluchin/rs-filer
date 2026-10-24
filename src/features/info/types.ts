import type { DirStats, ItemInfo_Serialize, ItemKind } from "../../bindings";

/** ファイル・ディレクトリの詳細 (バックエンドから受け取る形). */
export type ItemInfo = ItemInfo_Serialize;

export type { DirStats, ItemKind };

/**
 * 詳細の取得状況.
 */
export type InfoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; info: ItemInfo };

/**
 * 配下の合計の計算状況.
 */
export type StatsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stats: DirStats };
