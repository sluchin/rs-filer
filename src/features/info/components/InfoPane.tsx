import type { ReactElement } from "react";
import { formatBytesDetail, formatDate } from "../../../utils/formatters";
import type { InfoState, ItemInfo, ItemKind, StatsState } from "../types";

/**
 * InfoPane コンポーネントのプロパティ.
 */
interface InfoPaneProps {
  /** 詳細の取得状況. */
  info: InfoState;
  /** ディレクトリの配下の合計の計算状況. ディレクトリ以外では `idle`. */
  stats: StatsState;
}

/** 種類の表示名. */
const KIND_LABELS: Record<ItemKind, string> = {
  file: "ファイル",
  dir: "ディレクトリ",
  symlink: "シンボリックリンク",
  other: "その他",
};

/**
 * 詳細の 1 行 (見出しと値).
 */
export interface InfoRow {
  /** 見出し. */
  label: string;
  /** 値. */
  value: string;
}

/**
 * 配下の合計を, 表示する文字列にします.
 *
 * @param stats - 配下の合計の計算状況.
 * @returns 表示する文字列. 対象外 (`idle`) の場合は null.
 */
function statsText(stats: StatsState): string | null {
  if (stats.status === "idle") {
    return null;
  }
  if (stats.status === "loading") {
    return "計算中...";
  }
  if (stats.status === "error") {
    return stats.message;
  }
  const { files, dirs, bytes, errors, complete } = stats.stats;
  const notes = [
    complete ? null : "途中まで (時間または数の上限)",
    errors > 0 ? `読めない項目 ${errors} 件` : null,
  ].filter(Boolean);
  const suffix = notes.length > 0 ? ` (${notes.join(", ")})` : "";
  return `ファイル ${files.toLocaleString("en-US")} / ディレクトリ ${dirs.toLocaleString("en-US")} / ${formatBytesDetail(bytes)}${suffix}`;
}

/**
 * 項目の詳細を, 表示する行にします. 値が無い項目 (作成日時が不明など) は, 行にしません.
 *
 * @param info - 項目の詳細.
 * @param stats - ディレクトリの配下の合計の計算状況.
 * @returns 表示する行 (上から順).
 */
export function infoRows(info: ItemInfo, stats: StatsState): InfoRow[] {
  const isDir = info.kind === "dir";
  const attributes = [
    info.readonly ? "読み取り専用" : null,
    info.hidden ? "隠し" : null,
  ].filter(Boolean);
  const candidates: (InfoRow | null)[] = [
    { label: "名前", value: info.name },
    { label: "場所", value: info.path },
    { label: "種類", value: KIND_LABELS[info.kind] },
    info.symlink_target !== null
      ? { label: "リンク先", value: info.symlink_target }
      : null,
    info.extension !== null ? { label: "拡張子", value: info.extension } : null,
    isDir ? null : { label: "サイズ", value: formatBytesDetail(info.size) },
    info.modified !== null
      ? { label: "更新日時", value: formatDate(info.modified) }
      : null,
    info.created !== null
      ? { label: "作成日時", value: formatDate(info.created) }
      : null,
    info.accessed !== null
      ? { label: "アクセス日時", value: formatDate(info.accessed) }
      : null,
    {
      label: "属性",
      value: attributes.length > 0 ? attributes.join(", ") : "なし",
    },
    info.permissions !== null
      ? { label: "権限", value: info.permissions }
      : null,
    isDir && info.child_files !== null && info.child_dirs !== null
      ? {
          label: "直下",
          value: `ファイル ${info.child_files.toLocaleString("en-US")} / ディレクトリ ${info.child_dirs.toLocaleString("en-US")}`,
        }
      : null,
    isDir && statsText(stats) !== null
      ? { label: "配下の合計", value: statsText(stats) as string }
      : null,
  ];
  return candidates.filter((row): row is InfoRow => row !== null);
}

/**
 * 項目の詳細を表示するペイン. 反対側のペインの場所に表示されます (プレビューと同じ場所).
 *
 * @param props - コンポーネントのプロパティ.
 * @returns 詳細のReact要素.
 */
export default function InfoPane({ info, stats }: InfoPaneProps): ReactElement {
  const name = info.status === "ready" ? info.info.name : "";
  return (
    <div role="region" aria-label="info pane" className="pane preview-pane">
      <div className="preview-header">
        <span>{name}</span>
        <span>詳細</span>
      </div>
      <div className="preview-body">
        {info.status === "idle" && (
          <p className="preview-message">詳細を表示できる項目がありません.</p>
        )}
        {info.status === "loading" && (
          <p className="preview-message">読み込み中...</p>
        )}
        {info.status === "error" && (
          <p className="preview-message">{info.message}</p>
        )}
        {info.status === "ready" && (
          <dl className="info-list">
            {infoRows(info.info, stats).map((row) => (
              <div key={row.label} className="info-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
