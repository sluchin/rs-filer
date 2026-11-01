import { useState } from "react";
import type { PaneId, PaneState } from "../../explorer/types";
import { getBaseName } from "../../../utils/path";

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
 * (保存するファイルも 1 つ) なので, 入れ替えても引き継ぐ.
 *
 * @param deps - ペインの状態と操作.
 * @returns タブの一覧と, タブを操作する関数.
 */
export function useTabs({
  leftPane,
  rightPane,
  activePane,
  setActivePane,
  updatePane,
  loadDirectory,
  invalidateLoads,
  notify,
}: TabDeps) {
  // 今のタブの分は, 使わずに (今の状態を見る), タブを替えるときに書き換える
  const [saved, setSaved] = useState<TabSnapshot[]>(() => [
    { left: leftPane, right: rightPane, activePane },
  ]);
  const [active, setActive] = useState(0);

  /** 今のタブの状態. */
  const live = (): TabSnapshot => ({
    left: leftPane,
    right: rightPane,
    activePane,
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
    show(next);
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
    const next = { ...current, left: fresh(leftPane), right: fresh(rightPane) };
    const tabs = saved.map((tab, i) => (i === active ? current : tab));
    const at = atEnd ? tabs.length : active + 1;
    tabs.splice(at, 0, next);
    setSaved(tabs);
    setActive(at);
    updatePane("left", fresh);
    updatePane("right", fresh);
    // 検索の結果の表示は引き継げないので、ディレクトリを読み直す
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
      // 表示していないタブを閉じる. 表示は変えず, 番号だけ詰める.
      setSaved(rest);
      setActive(index < active ? active - 1 : active);
      return;
    }
    const target = Math.min(active, rest.length - 1);
    setSaved(rest);
    setActive(target);
    show(rest[target]);
  };

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
    nextTab: () => moveTab(1),
    previousTab: () => moveTab(-1),
    selectTab,
  };
}
