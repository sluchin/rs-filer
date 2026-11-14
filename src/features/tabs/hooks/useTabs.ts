import { useEffect, useState } from "react";
import loglevel from "loglevel";
import type { PaneId, PaneState } from "../../explorer/types";
import { getBaseName } from "../../../utils/path";
import { NO_OVERLAYS, type PaneOverlays } from "../../../hooks/useDialogs";
import { loadConfig, saveLastPaths } from "../../../services/tauriApi";

const log = loglevel.getLogger("tabs");

/**
 * 表示していないタブが保存している状態 (左右のペインと, アクティブなペイン).
 */
export interface TabSnapshot {
  /** 左ペインの状態. */
  left: PaneState;
  /** 右ペインの状態. */
  right: PaneState;
  /** アクティブなペイン. */
  activePane: PaneId;
  /** ブックマーク・移動履歴・最近開いたファイルの一覧と, ツリーの表示 (タブごとに持つ). */
  overlays: PaneOverlays;
  /** 前回の終了時から復元しただけで, まだディレクトリを読み込んでいないタブ. 初めて表示するときに読み込む. */
  lazy?: boolean;
}

/**
 * タブの表示用の情報.
 */
export interface TabInfo {
  /** タブに出す名前 (左ペインのディレクトリ名). */
  label: string;
  /** 左右のペインのディレクトリ (ツールチップ用. `左: パス / 右: パス`). */
  title: string;
  /** そのタブが, 今表示しているタブかどうか. */
  active: boolean;
}

/**
 * `useTabs` が使う, ペインの状態と操作.
 */
export interface TabDeps {
  /** 左ペインの状態 (今のタブの). */
  leftPane: PaneState;
  /** 右ペインの状態 (今のタブの). */
  rightPane: PaneState;
  /** アクティブなペイン (今のタブの). */
  activePane: PaneId;
  /** アクティブなペインを設定する. */
  setActivePane: (pane: PaneId) => void;
  /** 今のタブの, 一覧 (ブックマーク・移動履歴・最近開いたファイル) とツリーの表示. */
  overlays: PaneOverlays;
  /** 一覧の表示を, 指定したものに替える. */
  setOverlays: (overlays: PaneOverlays) => void;
  /** ペインの状態を更新する. */
  updatePane: (pane: PaneId, updater: (prev: PaneState) => PaneState) => void;
  /** ディレクトリを読み込む. */
  loadDirectory: (pane: PaneId, path: string) => Promise<void>;
  /** 読み込み中のものがあれば, その結果を捨てるようにする (タブを替えたとき, 前のタブの結果が混ざらないように). */
  invalidateLoads: () => void;
  /** 利用者へのお知らせを出す. */
  notify: (message: string) => void;
}

/**
 * 画面全体 (左右のペインの組) を, タブとして複数持てるようにするフック.
 *
 * 今のタブの状態は, 今までどおり `useFileList` が持つ (`leftPane` / `rightPane`). 表示していないタブの状態は
 * ここで保存し, タブを替えるときに, 入れ替える. ディレクトリの移動履歴は, ペインの左右ごとに 1 つ
 * (保存するファイルも 1 つ) なので入れ替えても引き継ぐ.
 *
 * @param deps - ペインの状態と操作.
 * @returns タブの一覧と, タブを操作する関数.
 */
export function useTabs({
  leftPane,
  rightPane,
  activePane,
  setActivePane,
  overlays,
  setOverlays,
  updatePane,
  loadDirectory,
  invalidateLoads,
  notify,
}: TabDeps) {
  // 今のタブの分は, 使わずに (今の状態を見る), タブを替えるときに書き換える
  const [saved, setSaved] = useState<TabSnapshot[]>(() => [
    { left: leftPane, right: rightPane, activePane, overlays },
  ]);
  const [active, setActive] = useState(0);
  // 復元したタブの元になる, 最初のペインの状態 (並べ方や隠しファイルの設定を引き継ぐ)
  const [initial] = useState(() => ({ left: leftPane, right: rightPane }));
  // 前回のタブの復元が終わるまでは, タブを保存しない (1 つのタブで上書きしないため)
  const [ready, setReady] = useState(false);

  // 起動したとき, 前回のタブを復元する. 今のタブは, 起動時のディレクトリの復元 (`useFileList`) が開くので,
  // 他のタブは, 表示するときに読み込む.
  useEffect(() => {
    let cancelled = false;
    const restore = async (): Promise<void> => {
      try {
        const last = (await loadConfig()).last_paths;
        const list = last?.tabs;
        if (!cancelled && last && list && list.length > 1) {
          const current = Math.min(last.active_tab ?? 0, list.length - 1);
          setSaved(
            list.map((paths, i) => ({
              left: { ...initial.left, currentPath: paths.left },
              right: { ...initial.right, currentPath: paths.right },
              activePane: "left" as const,
              overlays: NO_OVERLAYS,
              lazy: i !== current,
            })),
          );
          setActive(current);
        }
      } catch (e) {
        log.warn("前回のタブの読み込みに失敗:", e);
      }
      if (!cancelled) {
        setReady(true);
      }
    };
    restore();
    return () => {
      cancelled = true;
    };
  }, [initial]);

  /** 今のタブの状態. */
  const live = (): TabSnapshot => ({
    left: leftPane,
    right: rightPane,
    activePane,
    overlays,
  });

  /**
   * 表示するタブの状態を, ペインに設定する. 履歴は, 今のものを引き継ぐ.
   *
   * @param next - 表示するタブの状態.
   */
  const show = (next: TabSnapshot): void => {
    invalidateLoads();
    (["left", "right"] as const).forEach((pane) => {
      updatePane(pane, (prev) => ({
        ...next[pane],
        history: prev.history,
        historyIndex: prev.historyIndex,
      }));
    });
    setActivePane(next.activePane);
    setOverlays(next.overlays);
  };

  /**
   * タブを表示する. 復元しただけのタブは, ディレクトリを読み込む.
   *
   * @param next - 表示するタブの状態.
   */
  const reveal = (next: TabSnapshot): void => {
    show(next);
    if (next.lazy) {
      loadDirectory("left", next.left.currentPath);
      loadDirectory("right", next.right.currentPath);
    }
  };

  /**
   * 指定した番号のタブへ替える. 今のタブか, 範囲の外なら何もしない.
   *
   * @param target - タブの番号 (0 から).
   */
  const selectTab = (target: number): void => {
    if (target === active || target < 0 || target >= saved.length) {
      return;
    }
    const next = saved[target];
    setSaved(saved.map((tab, i) => (i === active ? live() : tab)));
    setActive(target);
    reveal(next);
  };

  /**
   * 次 (前) のタブへ替える. 端からは, 反対の端へ回る.
   *
   * @param delta - 進む数 (前は -1).
   */
  const moveTab = (delta: number): void =>
    selectTab((active + delta + saved.length) % saved.length);

  /**
   * 新しいタブを作って替える. 新しいタブは, 今のタブと同じディレクトリを開く
   * (マーク, 絞り込み, 検索の結果は引き継がない).
   *
   * @param atEnd - true の場合は一番右に, そうでなければ今のタブの右に作る.
   */
  const newTab = (atEnd = false): void => {
    const current = live();
    const fresh = (pane: PaneState): PaneState => ({
      ...pane,
      marks: [],
      flags: [],
      filter: null,
    });
    // 一覧 (ブックマークなど) とツリーは, そのタブだけのものなので, 新しいタブでは閉じておく
    const next = {
      ...current,
      left: fresh(leftPane),
      right: fresh(rightPane),
      overlays: NO_OVERLAYS,
    };
    const tabs = saved.map((tab, i) => (i === active ? current : tab));
    const at = atEnd ? tabs.length : active + 1;
    tabs.splice(at, 0, next);
    setSaved(tabs);
    setActive(at);
    updatePane("left", fresh);
    updatePane("right", fresh);
    setOverlays(NO_OVERLAYS);
    // 検索の結果の表示は引き継げないので, ディレクトリを読み直す
    (["left", "right"] as const).forEach((pane) => {
      if (current[pane].search !== null) {
        loadDirectory(pane, current[pane].currentPath);
      }
    });
  };

  /**
   * タブを閉じる. 今のタブを閉じたときは, 隣のタブへ替える. タブが 1 つしか無いときは閉じない.
   *
   * @param index - 閉じるタブの番号 (0 から). 省略した場合は, 今のタブ.
   */
  const closeTab = (index = active): void => {
    if (saved.length === 1) {
      notify("最後のタブは閉じられません");
      return;
    }
    const rest = saved.filter((_, i) => i !== index);
    if (index !== active) {
      // 表示していないタブを閉じる. 表示は変えず番号だけ詰める.
      setSaved(rest);
      setActive(index < active ? active - 1 : active);
      return;
    }
    const target = Math.min(active, rest.length - 1);
    setSaved(rest);
    setActive(target);
    reveal(rest[target]);
  };

  // 前回のタブとして保存する (どのタブも, ディレクトリが決まってから).
  const paths = saved.map((tab, i) => {
    const snapshot = i === active ? live() : tab;
    return {
      left: snapshot.left.currentPath,
      right: snapshot.right.currentPath,
    };
  });
  const pathsKey = JSON.stringify(paths);
  useEffect(() => {
    const list: { left: string; right: string }[] = JSON.parse(pathsKey);
    if (!ready || list.some((p) => p.left === "" || p.right === "")) {
      return;
    }
    saveLastPaths({
      left: list[active].left,
      right: list[active].right,
      tabs: list,
      active_tab: active,
    }).catch((e) => {
      log.warn("タブの保存に失敗:", e);
    });
  }, [ready, pathsKey, active]);

  /**
   * 条件に合うタブだけを残して, 他を閉じる. 今のタブが閉じるものに入るときは, 指定したタブへ替える.
   *
   * @param keep - 残すタブかどうか (タブの番号を渡す).
   * @param focus - 今のタブが閉じるときに, 替わる先のタブの番号 (残るタブの 1 つ).
   */
  const keepTabs = (keep: (index: number) => boolean, focus: number): void => {
    const all = saved.map((tab, i) => (i === active ? live() : tab));
    const rest = all.filter((_, i) => keep(i));
    if (rest.length === all.length) {
      return;
    }
    // 番号が詰まるので, 残るタブの中での位置を数える
    const positionOf = (index: number): number =>
      all.slice(0, index).filter((_, i) => keep(i)).length;
    setSaved(rest);
    if (keep(active)) {
      setActive(positionOf(active));
      return;
    }
    setActive(positionOf(focus));
    reveal(rest[positionOf(focus)]);
  };

  /**
   * 指定したタブより右のタブを, 全て閉じる. 今のタブが閉じるときは, 指定したタブへ替える.
   *
   * @param index - このタブは残す (0 から).
   */
  const closeTabsToRight = (index: number): void =>
    keepTabs((i) => i <= index, index);

  /**
   * 指定したタブ以外を, 全て閉じる. 今のタブが閉じるときは, 指定したタブへ替える.
   *
   * @param index - このタブは残す (0 から).
   */
  const closeOtherTabs = (index: number): void =>
    keepTabs((i) => i === index, index);

  const tabs: TabInfo[] = saved.map((tab, i) => {
    const snapshot = i === active ? live() : tab;
    const path = snapshot.left.currentPath;
    return {
      label: getBaseName(path) || path,
      title: `左: ${path} / 右: ${snapshot.right.currentPath}`,
      active: i === active,
    };
  });

  return {
    tabs,
    newTab,
    closeTab,
    closeTabsToRight,
    closeOtherTabs,
    nextTab: () => moveTab(1),
    previousTab: () => moveTab(-1),
    selectTab,
  };
}
