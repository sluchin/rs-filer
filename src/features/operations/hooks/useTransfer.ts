import { useCallback, useState } from "react";
import log from "loglevel";
import {
  cancelTransfer,
  checkConflicts,
  copyFilesToClipboard,
  readClipboardFiles,
  runTransfer,
} from "../../../services/tauriApi";
import type { LoadOptions } from "../../explorer/hooks/useFileList";
import type { FileEntry, PaneId, PaneState } from "../../explorer/types";
import type { TaskState, TransferKind, TransferRequest } from "../types";

/** 操作の種類ごとの, 表示に使う動詞. */
const LABELS: Record<TransferKind, string> = {
  copy: "コピー",
  move: "移動",
  delete: "削除",
};

/**
 * 操作の対象を返します. マークがあればマークしたエントリ, 無ければカーソル位置のエントリです.
 *
 * @param state - ペインの状態.
 * @returns 対象のエントリ. 無い場合は空の配列.
 */
export function targetsOf(state: PaneState): FileEntry[] {
  const marked = state.files.filter((f) => state.marks.includes(f.path));
  if (marked.length > 0) {
    return marked;
  }
  const current = state.files[state.selectedIndex];
  return current ? [current] : [];
}

/**
 * コピー・移動・削除を, 進捗の表示と中断に対応して実行するフック.
 *
 * @param activePane - アクティブなペイン識別子.
 * @param leftPane - 左ペインの状態.
 * @param rightPane - 右ペインの状態.
 * @param updatePane - ペインの状態を更新する関数.
 * @param loadDirectory - ペインのディレクトリを読み込む関数.
 * @param setError - エラーメッセージを設定する関数.
 * @param notify - 完了などのメッセージを通知する関数.
 * @param openConfirm - 確認ダイアログを開く関数.
 * @returns 実行中の操作の状態と, 各操作を開始・中断するハンドラー.
 */
export function useTransfer(
  activePane: PaneId,
  leftPane: PaneState,
  rightPane: PaneState,
  updatePane: (pane: PaneId, updater: (prev: PaneState) => PaneState) => void,
  loadDirectory: (
    pane: PaneId,
    path: string,
    options?: LoadOptions,
  ) => Promise<void>,
  setError: (message: string | null) => void,
  notify: (message: string) => void,
  openConfirm: (title: string, message: string, onConfirm: () => void) => void,
  openPrompt: (
    title: string,
    onSubmit: (value: string) => void,
    initialValue?: string,
  ) => void,
) {
  const [running, setTask] = useState<Omit<TaskState, "cancelling"> | null>(
    null,
  );
  const [cancelling, setCancelling] = useState(false);
  const otherPane: PaneId = activePane === "left" ? "right" : "left";
  const source = activePane === "left" ? leftPane : rightPane;
  const dest = activePane === "left" ? rightPane : leftPane;

  /**
   * 操作を実行し, 終わったらマークを解除して両ペインを再読み込みします. 途中で失敗しても, 処理済みの分を反映するため再読み込みします.
   */
  const run = useCallback(
    async (request: TransferRequest): Promise<void> => {
      const label = LABELS[request.kind];
      const srcPane = activePane;
      const srcPath = source.currentPath;
      const destPath = dest.currentPath;
      setCancelling(false);
      setTask({ kind: request.kind, done: 0, total: 0, current: "" });
      let failure: string | null = null;
      try {
        setError(null);
        const summary = await runTransfer(request, (progress) =>
          setTask((t) => (t ? { ...t, ...progress } : t)),
        );
        const count = request.sources.length;
        notify(
          summary.cancelled
            ? `${label}を中断しました (${summary.processed}/${count} 件処理済み)`
            : `${label}しました: ${summary.processed} 件`,
        );
      } catch (e) {
        log.error(`[React] ${label} 失敗:`, e);
        failure = String(e);
      }
      setTask(null);
      updatePane(srcPane, (p) => ({ ...p, marks: [] }));
      await loadDirectory(srcPane, srcPath, { keepCursor: true });
      if (request.kind !== "delete") {
        await loadDirectory(otherPane, destPath, { keepCursor: true });
      }
      // 再読み込みでエラー表示が消えるため, 失敗した場合は最後に表示し直す.
      if (failure !== null) {
        setError(failure);
      }
    },
    [
      activePane,
      otherPane,
      source.currentPath,
      dest.currentPath,
      setError,
      notify,
      updatePane,
      loadDirectory,
    ],
  );

  /**
   * 対象を対向ペインへコピー・移動します. 同名のものがあれば上書きを確認します.
   *
   * @param kind - コピーか移動か.
   * @param alwaysConfirm - true の場合は, 同名のものが無くても実行前に確認する.
   */
  const startPlace = useCallback(
    async (kind: "copy" | "move", alwaysConfirm: boolean): Promise<void> => {
      const files = targetsOf(source);
      if (files.length === 0) {
        setError("対象の項目が選択されていません.");
        return;
      }
      if (source.currentPath === dest.currentPath) {
        // 同じディレクトリの場合, コピーなら名前をつけてコピー, 移動はエラー.
        if (kind === "copy") {
          if (files.length !== 1) {
            setError("1 件だけコピーしてください.");
            return;
          }
          const file = files[0];
          openPrompt(
            "名前を付けてコピー",
            (newName: string) => {
              run({
                kind: "copy",
                sources: [file.path],
                dest_dir: source.currentPath,
                overwrite: false,
                permanent: false,
                dest_name: newName,
              });
            },
            file.name,
          );
        } else {
          setError(
            "対向ペインが同じディレクトリです. 別のディレクトリを開いてください.",
          );
        }
        return;
      }
      const sources = files.map((f) => f.path);
      let conflicts: string[];
      try {
        setError(null);
        conflicts = await checkConflicts(sources, dest.currentPath);
      } catch (e) {
        setError(String(e));
        return;
      }
      const request: TransferRequest = {
        kind,
        sources,
        dest_dir: dest.currentPath,
        overwrite: conflicts.length > 0,
        permanent: false,
      };
      const label = LABELS[kind];
      if (conflicts.length > 0) {
        const names = conflicts.slice(0, 3).join(", ");
        const more = conflicts.length > 3 ? " ほか" : "";
        openConfirm(
          `${label}の上書き`,
          `${conflicts.length} 件が既に存在します (${names}${more}). 上書きして${label}しますか? (y/n)`,
          () => run(request),
        );
      } else if (alwaysConfirm) {
        openConfirm(
          label,
          `${files.length} 件を「${dest.currentPath}」へ${label}しますか? (y/n)`,
          () => run(request),
        );
      } else {
        await run(request);
      }
    },
    [source, dest, setError, openConfirm, openPrompt, run],
  );

  /**
   * 対象を, 確認のうえ削除します.
   *
   * @param permanent - true の場合は完全に削除し, false の場合はゴミ箱へ移動する.
   */
  const startDelete = useCallback(
    (permanent: boolean): void => {
      const files = targetsOf(source);
      if (files.length === 0) {
        setError("対象の項目が選択されていません.");
        return;
      }
      const what =
        files.length === 1 ? `「${files[0].name}」` : `${files.length} 件`;
      openConfirm(
        permanent ? "完全に削除" : "ゴミ箱へ移動",
        permanent
          ? `${what}を完全に削除しますか? 元に戻せません. (y/n)`
          : `${what}をゴミ箱へ移動しますか? (y/n)`,
        () =>
          run({
            kind: "delete",
            sources: files.map((f) => f.path),
            dest_dir: null,
            overwrite: false,
            permanent,
          }),
      );
    },
    [source, setError, openConfirm, run],
  );

  /** 実行中の操作を中断します. */
  const cancel = useCallback((): void => {
    setCancelling(true);
    cancelTransfer().catch((e) => log.warn("[React] 中断の要求に失敗:", e));
  }, []);

  /** クリップボードへファイルをコピーします. */
  const copyToClipboard = useCallback((): void => {
    const files = targetsOf(source);
    if (files.length === 0) {
      setError("対象の項目が選択されていません.");
      return;
    }
    const paths = files.map((f) => f.path);
    copyFilesToClipboard(paths)
      .then(() => {
        notify(`${files.length} 件をコピーしました`);
      })
      .catch((e) => setError(String(e)));
  }, [source, setError, notify]);

  /** クリップボードからファイルを貼り付けます. */
  const pasteFromClipboard = useCallback(async (): Promise<void> => {
    let clipboardFiles: string[];
    try {
      clipboardFiles = await readClipboardFiles();
    } catch (e) {
      setError(String(e));
      return;
    }

    if (clipboardFiles.length === 0) {
      setError("クリップボードが空です.");
      return;
    }

    // 全ファイルの親ディレクトリが同じかチェック.
    const parents = new Set(
      clipboardFiles.map((p) => p.substring(0, p.lastIndexOf("/"))),
    );

    if (parents.size === 1 && parents.has(source.currentPath)) {
      // 同一ディレクトリの場合, 別名でコピーを作成.
      if (clipboardFiles.length !== 1) {
        setError("同一ディレクトリ内では, 1 件ずつコピーしてください.");
        return;
      }
      const originalPath = clipboardFiles[0];
      const originalName = originalPath.substring(
        originalPath.lastIndexOf("/") + 1,
      );
      openPrompt(
        "名前を付けてコピー",
        (newName: string) => {
          const files = [originalPath];
          run({
            kind: "copy",
            sources: files,
            dest_dir: source.currentPath,
            overwrite: false,
            permanent: false,
            dest_name: newName,
          });
        },
        originalName,
      );
    } else {
      // 別ディレクトリからのコピーは通常のコピー処理.
      try {
        const conflicts = await checkConflicts(
          clipboardFiles,
          source.currentPath,
        );
        const request: TransferRequest = {
          kind: "copy",
          sources: clipboardFiles,
          dest_dir: source.currentPath,
          overwrite: conflicts.length > 0,
          permanent: false,
        };
        if (conflicts.length > 0) {
          const names = conflicts.slice(0, 3).join(", ");
          const more = conflicts.length > 3 ? " ほか" : "";
          openConfirm(
            "コピーの上書き",
            `${conflicts.length} 件が既に存在します (${names}${more}). 上書きしてコピーしますか? (y/n)`,
            () => run(request),
          );
        } else {
          await run(request);
        }
      } catch (e) {
        setError(String(e));
      }
    }
  }, [source, setError, openPrompt, openConfirm, run]);

  /** ファイルを同じディレクトリ内でコピーします. */
  const duplicateFile = useCallback((): void => {
    const files = targetsOf(source);
    if (files.length === 0) {
      setError("対象の項目が選択されていません.");
      return;
    }
    if (files.length !== 1) {
      setError("1 件だけコピーしてください.");
      return;
    }
    const file = files[0];
    const originalName = file.name;
    openPrompt(
      "名前を付けてコピー",
      (newName: string) => {
        run({
          kind: "copy",
          sources: [file.path],
          dest_dir: source.currentPath,
          overwrite: false,
          permanent: false,
          dest_name: newName,
        });
      },
      originalName,
    );
  }, [source, setError, openPrompt, run]);

  return {
    task: running && { ...running, cancelling },
    startCopy: (alwaysConfirm: boolean) => startPlace("copy", alwaysConfirm),
    startMove: (alwaysConfirm: boolean) => startPlace("move", alwaysConfirm),
    startDelete,
    copyToClipboard,
    pasteFromClipboard,
    duplicateFile,
    cancel,
  };
}
