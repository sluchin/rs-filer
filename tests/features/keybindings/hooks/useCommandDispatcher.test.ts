import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntry, PaneState } from "@/features/explorer/types";
import {
  useCommandDispatcher,
  type CommandDispatcherDeps,
} from "@/features/keybindings/hooks/useCommandDispatcher";

vi.mock("@/services/tauriApi", () => ({
  getHomeDir: vi.fn(),
  openTerminal: vi.fn(),
  quitApp: vi.fn(),
  runExternalCommand: vi.fn(),
}));

const entry = (name: string): FileEntry => ({
  name,
  path: `/work/${name}`,
  is_dir: false,
  size: 0,
  modified: null,
  readonly: false,
  hidden: false,
});

/** ペインの状態を作る. */
const pane = (files: FileEntry[], selectedIndex: number): PaneState => ({
  currentPath: "/work",
  files,
  allFiles: files,
  selectedIndex,
  marks: [],
  flags: [],
  showHidden: false,
  showDetails: true,
  sort: { key: "name", desc: false },
  filter: null,
  history: [],
  historyIndex: -1,
});

/** 右ペインをアクティブにして, 偽の依存を作る. */
function makeDeps(right: PaneState, colName?: number) {
  const panels = {
    togglePreview: vi.fn(),
    toggleInfo: vi.fn(),
    openLog: vi.fn(),
    openHistoryList: vi.fn(),
    openBookmarks: vi.fn(),
    toggleTree: vi.fn(),
    openPalette: vi.fn(),
    openHelp: vi.fn(),
  };
  const deps = {
    activePane: "right",
    leftPane: pane([], 0),
    rightPane: right,
    switchPane: vi.fn(),
    fileList: { moveCursor: vi.fn(), loadDirectory: vi.fn(), setView: vi.fn() },
    navigation: { handleParentDir: vi.fn() },
    operations: {},
    transfer: {},
    marks: {},
    settings: {
      config: {
        pane_column_widths: { left: {}, right: { col_name: colName } },
      },
      updatePaneColumnWidth: vi.fn(),
    },
    bookmarks: { toggleBookmark: vi.fn() },
    panels,
    pathInputs: { current: { left: null, right: null } },
    filterInputs: { current: { left: null, right: null } },
    openEntry: vi.fn(),
    copyText: vi.fn(),
    reportError: vi.fn(),
  } as unknown as CommandDispatcherDeps;
  return { deps, panels };
}

describe("useCommandDispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 表示の切り替えのコマンドを, アクティブなペインを付けて panels へ振り分ける", () => {
    const { deps, panels } = makeDeps(pane([entry("a.txt")], 0));
    const run = useCommandDispatcher(deps);

    run("preview");
    run("info");
    run("log");
    run("historyList");
    run("bookmarks");
    run("toggleTree");
    run("palette");
    run("help");

    expect(panels.togglePreview).toHaveBeenCalledTimes(1);
    expect(panels.toggleInfo).toHaveBeenCalledTimes(1);
    expect(panels.openLog).toHaveBeenCalledTimes(1);
    expect(panels.openHistoryList).toHaveBeenCalledWith("right");
    expect(panels.openBookmarks).toHaveBeenCalledWith("right");
    expect(panels.toggleTree).toHaveBeenCalledWith("right");
    expect(panels.openPalette).toHaveBeenCalledTimes(1);
    expect(panels.openHelp).toHaveBeenCalledTimes(1);
  });

  it("正常系: ブックマークへの追加は, 今のディレクトリを切り替えてから一覧を出す", () => {
    const { deps, panels } = makeDeps(pane([], 0));

    useCommandDispatcher(deps)("addBookmark");

    expect(deps.bookmarks.toggleBookmark).toHaveBeenCalledWith("/work");
    expect(panels.openBookmarks).toHaveBeenCalledWith("right");
  });

  it("正常系: open は, `..` の行なら親へ, それ以外ならカーソル位置の項目を開く", () => {
    const file = entry("a.txt");
    const parentRow = makeDeps(pane([file], -1)).deps;
    useCommandDispatcher(parentRow)("open");
    expect(parentRow.navigation.handleParentDir).toHaveBeenCalledWith("right");

    const fileRow = makeDeps(pane([file], 0)).deps;
    useCommandDispatcher(fileRow)("open");
    expect(fileRow.openEntry).toHaveBeenCalledWith("right", file);
  });

  it("正常系: 名前の列の幅は, 既定の幅から変え, 最小値より狭くしない", () => {
    const wider = makeDeps(pane([], 0)).deps;
    useCommandDispatcher(wider)("resizeColumnWider");
    expect(wider.settings.updatePaneColumnWidth).toHaveBeenCalledWith("right", {
      col_name: 310,
    });

    const narrower = makeDeps(pane([], 0), 35).deps;
    useCommandDispatcher(narrower)("resizeColumnNarrower");
    expect(narrower.settings.updatePaneColumnWidth).toHaveBeenCalledWith(
      "right",
      { col_name: 30 },
    );
  });

  it("異常系: カーソル位置に項目が無ければ, フルパスをコピーせずにエラーを出す", () => {
    const { deps } = makeDeps(pane([], -1));

    useCommandDispatcher(deps)("copyFullPath");

    expect(deps.copyText).not.toHaveBeenCalled();
    expect(deps.reportError).toHaveBeenCalledWith(
      "対象の項目が選択されていません.",
    );
  });
});
