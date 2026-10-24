import { useCallback, useLayoutEffect, useRef, useState } from "react";
import log from "loglevel";
import {
  cancelTransfer,
  checkConflicts,
  checkNestedConflicts,
  checkStaleOverwrites,
  copyFilesToClipboard,
  readClipboardFiles,
  runTransfer,
} from "../../../services/tauriApi";
import type { PaneDeps } from "../../explorer/hooks/useFileList";
import type { FileEntry, PaneId, PaneState } from "../../explorer/types";
import type {
  ChoiceOption,
  NestedConflict,
  TaskState,
  TransferKind,
  TransferRequest,
} from "../types";
import { nestedMessage, overwriteMessage } from "../overwriteMessage";
import { getBaseName, getParentPath, isSamePath } from "../../../utils/path";

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
 * `useTransfer` が使う, ペインの状態と操作, 通知とダイアログを開く関数.
 */
export interface TransferDeps extends PaneDeps {
  /** ペインの状態を更新する関数. */
  updatePane: (pane: PaneId, updater: (prev: PaneState) => PaneState) => void;
  /** 完了などのメッセージを通知する関数. */
  notify: (message: string) => void;
  /** 確認ダイアログを開く関数. */
  openConfirm: (title: string, message: string, onConfirm: () => void) => void;
  /** 入力ダイアログを開く関数. */
  openPrompt: (
    title: string,
    onSubmit: (value: string) => void,
    initialValue?: string,
  ) => void;
  /** 選択肢ダイアログを開く関数 (同名のファイルを 1 件ずつ確認するのに使う). */
  openChoice: (title: string, message: string, choices: ChoiceOption[]) => void;
}

/**
 * コピー・移動・削除を, 進捗の表示と中断に対応して実行するフック.
 *
 * @param deps - ペインの状態と操作, 通知とダイアログを開く関数.
 * @returns 実行中の操作の状態と, 各操作を開始・中断するハンドラー.
 */
export function useTransfer({
  activePane,
  leftPane,
  rightPane,
  updatePane,
  loadDirectory,
  setError,
  notify,
  openConfirm,
  openPrompt,
  openChoice,
}: TransferDeps) {
  const [running, setTask] = useState<Omit<TaskState, "cancelling"> | null>(
    null,
  );
  const [cancelling, setCancelling] = useState(false);
  const [background, setBackground] = useState(false);
  const source = activePane === "left" ? leftPane : rightPane;
  const dest = activePane === "left" ? rightPane : leftPane;

  /** 最後に描画したときの左右のペインの状態 (操作が終わった時点で, 各ペインが開いているディレクトリを知るため). */
  const latestPanes = useRef<Record<PaneId, PaneState>>({
    left: leftPane,
    right: rightPane,
  });
  useLayoutEffect(() => {
    latestPanes.current = { left: leftPane, right: rightPane };
  });

  /**
   * 操作を実行し, 終わったら対象のマークを解除して, 変更のあったディレクトリを開いているペインを再読み込みします.
   * 途中で失敗しても, 処理済みの分を反映するため再読み込みします.
   *
   * 再読み込みするのは, 操作が終わった時点で, 移動元か送り先のディレクトリを開いているペインです (バックグラウンドで
   * 実行している間に, 別のディレクトリへ移ったペインは, そのままにする).
   */
  const run = useCallback(
    async (request: TransferRequest): Promise<void> => {
      const label = LABELS[request.kind];
      if (running !== null) {
        setError(
          "別のコピー・移動・削除を実行中です. 終わってから実行してください.",
        );
        return;
      }
      const srcPane = activePane;
      const changed = [source.currentPath, request.dest_dir].filter(
        (p): p is string => p !== null && p !== undefined,
      );
      setCancelling(false);
      setBackground(false);
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
      updatePane(srcPane, (p) => ({
        ...p,
        marks: p.marks.filter((m) => !request.sources.includes(m)),
      }));
      for (const pane of ["left", "right"] as const) {
        const { currentPath, historyIndex } = latestPanes.current[pane];
        if (changed.some((p) => isSamePath(p, currentPath))) {
          await loadDirectory(pane, currentPath, {
            keepCursor: true,
            historyIndex,
          });
        }
      }
      // 再読み込みでエラー表示が消えるため, 失敗した場合は最後に表示し直す.
      if (failure !== null) {
        setError(failure);
      }
    },
    [
      running,
      activePane,
      source.currentPath,
      setError,
      notify,
      updatePane,
      loadDirectory,
    ],
  );

  /**
   * 同名のディレクトリを統合する場合に, 中にある同名のファイルを 1 件ずつ確認してから実行します.
   *
   * 各ファイルについて, `y` (はい: 上書き), `n` (いいえ: そのファイルは上書きせず, 移動元に残す),
   * `a` (全て上書き: 残りは確認せずに上書き) を選びます. `Esc` で全体を取りやめます (何も実行しません).
   * 同名のファイルが無ければ, そのまま実行します.
   *
   * @param request - 上書きを承諾済みの依頼.
   * @param label - 表示に使う動詞 (コピー・移動).
   */
  const runWithNestedConfirm = useCallback(
    async (request: TransferRequest, label: string): Promise<void> => {
      let nested: NestedConflict[];
      try {
        setError(null);
        // ここに来るのは, 送り先のあるコピーと移動だけ
        nested = await checkNestedConflicts(
          request.sources,
          request.dest_dir as string,
        );
      } catch (e) {
        setError(String(e));
        return;
      }
      if (nested.length === 0) {
        await run(request);
        return;
      }
      const skip: string[] = [];
      const ask = (index: number): void => {
        if (index >= nested.length) {
          void run({ ...request, skip });
          return;
        }
        const item = nested[index];
        openChoice(
          `${label}の上書き`,
          nestedMessage(
            item.label,
            index + 1,
            nested.length,
            item.stale === true,
          ),
          [
            { key: "y", label: "はい", run: () => ask(index + 1) },
            {
              key: "n",
              label: "いいえ",
              run: () => {
                skip.push(item.source);
                ask(index + 1);
              },
            },
            {
              key: "a",
              label: "全て上書き",
              run: () => void run({ ...request, skip }),
            },
          ],
        );
      };
      ask(0);
    },
    [setError, openChoice, run],
  );

  /**
   * 1 件の項目を, 新しい名前を尋ねてから, 今のディレクトリへコピーします (名前を付けてコピー).
   *
   * @param items - コピーする項目 (絶対パスと名前). 1 件でなければエラーを表示する.
   */
  const promptCopyAs = useCallback(
    (items: { path: string; name: string }[]): void => {
      if (items.length !== 1) {
        setError("1 件だけコピーしてください.");
        return;
      }
      const [item] = items;
      openPrompt(
        "名前を付けてコピー",
        (newName: string) => {
          run({
            kind: "copy",
            sources: [item.path],
            dest_dir: source.currentPath,
            overwrite: false,
            permanent: false,
            dest_name: newName,
          });
        },
        item.name,
      );
    },
    [source.currentPath, setError, openPrompt, run],
  );

  /**
   * 対象を指定したディレクトリへコピー・移動します. 同名のものがあれば上書きを確認します.
   *
   * @param kind - コピーか移動か.
   * @param sources - 対象の絶対パス.
   * @param destDir - 送り先のディレクトリ.
   * @param alwaysConfirm - true の場合は, 同名のものが無くても実行前に確認する.
   */
  const placeInto = useCallback(
    async (
      kind: "copy" | "move",
      sources: string[],
      destDir: string,
      alwaysConfirm: boolean,
    ): Promise<void> => {
      let conflicts: string[];
      let stale: string[] = [];
      try {
        setError(null);
        conflicts = await checkConflicts(sources, destDir);
        if (conflicts.length > 0) {
          stale = await checkStaleOverwrites(sources, destDir);
        }
      } catch (e) {
        setError(String(e));
        return;
      }
      const request: TransferRequest = {
        kind,
        sources,
        dest_dir: destDir,
        overwrite: conflicts.length > 0,
        permanent: false,
      };
      const label = LABELS[kind];
      if (conflicts.length > 0) {
        openConfirm(
          `${label}の上書き`,
          overwriteMessage(label, conflicts, stale),
          () => runWithNestedConfirm(request, label),
        );
      } else if (alwaysConfirm) {
        openConfirm(
          label,
          `${sources.length} 件を「${destDir}」へ${label}しますか? (y/n)`,
          () => run(request),
        );
      } else {
        await run(request);
      }
    },
    [setError, openConfirm, run, runWithNestedConfirm],
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
          promptCopyAs(files);
        } else {
          setError(
            "対向ペインが同じディレクトリです. 別のディレクトリを開いてください.",
          );
        }
        return;
      }
      await placeInto(
        kind,
        files.map((f) => f.path),
        dest.currentPath,
        alwaysConfirm,
      );
    },
    [source, dest.currentPath, setError, promptCopyAs, placeInto],
  );

  /**
   * 削除の確認を出し, 承諾されたら削除を実行します.
   *
   * @param items - 削除する項目 (絶対パスと名前).
   * @param permanent - true の場合は完全に削除し, false の場合はゴミ箱へ移動する.
   * @param onDone - 削除の処理が終わったときに呼ぶ関数 (省略可).
   */
  const confirmDelete = useCallback(
    (
      items: { path: string; name: string }[],
      permanent: boolean,
      onDone?: () => void,
    ): void => {
      const what =
        items.length === 1 ? `「${items[0].name}」` : `${items.length} 件`;
      openConfirm(
        permanent ? "完全に削除" : "ゴミ箱へ移動",
        permanent
          ? `${what}を完全に削除しますか? 元に戻せません. (y/n)`
          : `${what}をゴミ箱へ移動しますか? (y/n)`,
        async () => {
          await run({
            kind: "delete",
            sources: items.map((f) => f.path),
            dest_dir: null,
            overwrite: false,
            permanent,
          });
          onDone?.();
        },
      );
    },
    [openConfirm, run],
  );

  /**
   * アクティブなペインの対象 (マーク,無ければカーソル位置) を, 確認のうえ削除します.
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
      confirmDelete(
        files.map((f) => ({ path: f.path, name: f.name })),
        permanent,
      );
    },
    [source, setError, confirmDelete],
  );

  /**
   * 指定した項目を, 確認のうえ削除します (ツリー表示用). 削除したら (失敗しても), 呼び出し側 (ツリー) へ知らせます.
   *
   * @param items - 削除する項目 (絶対パスと名前).
   * @param permanent - true の場合は完全に削除し, false の場合はゴミ箱へ移動する.
   * @param onDone - 削除の処理が終わったときに呼ぶ関数.
   */
  const startDeletePaths = useCallback(
    (
      items: { path: string; name: string }[],
      permanent: boolean,
      onDone: () => void,
    ): void => confirmDelete(items, permanent, onDone),
    [confirmDelete],
  );
  /** 実行中の操作を中断します. */
  const cancel = useCallback((): void => {
    setCancelling(true);
    cancelTransfer().catch((e) => log.warn("[React] 中断の要求に失敗:", e));
  }, []);

  /** 進捗ダイアログを隠して, 処理をバックグラウンドで続けます. */
  const sendToBackground = useCallback((): void => setBackground(true), []);

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

    // 全ファイルの親ディレクトリが, 今のディレクトリかチェック (Windows の `\` 区切りのパスも比べる).
    const sameDir = clipboardFiles.every((p) => {
      const parent = getParentPath(p);
      return parent !== null && isSamePath(parent, source.currentPath);
    });

    if (sameDir) {
      // 同一ディレクトリの場合, 別名でコピーを作成.
      promptCopyAs(
        clipboardFiles.map((p) => ({ path: p, name: getBaseName(p) })),
      );
    } else {
      // 別ディレクトリからのコピーは通常のコピー処理.
      await placeInto("copy", clipboardFiles, source.currentPath, false);
    }
  }, [source.currentPath, setError, promptCopyAs, placeInto]);

  /** ファイルを同じディレクトリ内でコピーします. */
  const duplicateFile = useCallback((): void => {
    const files = targetsOf(source);
    if (files.length === 0) {
      setError("対象の項目が選択されていません.");
      return;
    }
    promptCopyAs(files);
  }, [source, setError, promptCopyAs]);

  return {
    task: running && { ...running, cancelling },
    startCopy: (alwaysConfirm: boolean) => startPlace("copy", alwaysConfirm),
    startMove: (alwaysConfirm: boolean) => startPlace("move", alwaysConfirm),
    startDelete,
    startDeletePaths,
    copyToClipboard,
    pasteFromClipboard,
    duplicateFile,
    background,
    sendToBackground,
    cancel,
  };
}
