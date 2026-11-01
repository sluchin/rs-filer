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
  search: null,
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
    fileList: {
      moveCursor: vi.fn(),
      loadDirectory: vi.fn(),
      searchPane: vi.fn(),
      setView: vi.fn(),
    },
    navigation: { handleParentDir: vi.fn() },
    operations: { openPrompt: vi.fn() },
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

  it("正常系: findNameDired は, 名前を聞いて, アクティブなペインのディレクトリの下を名前で探す", () => {
    const { deps } = makeDeps(pane([entry("a.txt")], 0));
    useCommandDispatcher(deps)("findNameDired");

    const [title, onSubmit, initial] = vi.mocked(deps.operations.openPrompt)
      .mock.calls[0];
    expect(title).toContain("find-name-dired");
    expect(initial).toBeUndefined();
    onSubmit("note");
    expect(deps.fileList.searchPane).toHaveBeenCalledWith(
      "right",
      "/work",
      "name",
      "note",
      false,
    );
  });

  it("正常系: findGrepDired は, 正規表現を聞いて, ファイルの中身を探す", () => {
    const { deps } = makeDeps(pane([entry("a.txt")], 0));
    useCommandDispatcher(deps)("findGrepDired");

    const [title, onSubmit, initial] = vi.mocked(deps.operations.openPrompt)
      .mock.calls[0];
    expect(title).toContain("find-grep-dired");
    expect(initial).toBeUndefined();
    onSubmit("TODO");
    expect(deps.fileList.searchPane).toHaveBeenCalledWith(
      "right",
      "/work",
      "content",
      "TODO",
      false,
    );
  });

  it("正常系: 検索の結果の表示中に同じ種類の検索を開くと前の文字列を初期値にし, 別の種類なら空にする", () => {
    const searching = {
      ...pane([], 0),
      search: { kind: "name" as const, query: "old", truncated: false },
    };
    const sameKind = makeDeps(searching).deps;
    useCommandDispatcher(sameKind)("findNameDired");
    expect(vi.mocked(sameKind.operations.openPrompt).mock.calls[0][2]).toBe(
      "old",
    );

    const otherKind = makeDeps(searching).deps;
    useCommandDispatcher(otherKind)("findGrepDired");
    expect(
      vi.mocked(otherKind.operations.openPrompt).mock.calls[0][2],
    ).toBeUndefined();

    const grepping = {
      ...pane([], 0),
      search: { kind: "content" as const, query: "TODO", truncated: false },
    };
    const sameGrep = makeDeps(grepping).deps;
    useCommandDispatcher(sameGrep)("findGrepDired");
    expect(vi.mocked(sameGrep.operations.openPrompt).mock.calls[0][2]).toBe(
      "TODO",
    );
  });

  it("正常系: 隠しファイルの表示を切り替えると, 検索の結果の表示中だけ探し直す", () => {
    const normal = makeDeps(pane([], 0)).deps;
    useCommandDispatcher(normal)("toggleHidden");
    expect(normal.fileList.setView).toHaveBeenCalledWith("right", {
      showHidden: true,
    });
    expect(normal.fileList.searchPane).not.toHaveBeenCalled();

    const searching = {
      ...pane([], 0),
      search: { kind: "name" as const, query: "note", truncated: false },
    };
    const found = makeDeps(searching).deps;
    useCommandDispatcher(found)("toggleHidden");
    expect(found.fileList.searchPane).toHaveBeenCalledWith(
      "right",
      "/work",
      "name",
      "note",
      true,
    );
  });

  it("正常系: cancel は, 絞り込みを解除し, 検索の結果の表示中は元の一覧に戻す", () => {
    const filtering = makeDeps({ ...pane([], 0), filter: "a" }).deps;
    useCommandDispatcher(filtering)("cancel");
    expect(filtering.fileList.setView).toHaveBeenCalledWith("right", {
      filter: null,
    });

    const searching = makeDeps({
      ...pane([], 0),
      search: { kind: "name" as const, query: "a", truncated: false },
    }).deps;
    useCommandDispatcher(searching)("cancel");
    expect(searching.fileList.loadDirectory).toHaveBeenCalledWith(
      "right",
      "/work",
    );

    const idle = makeDeps(pane([], 0)).deps;
    useCommandDispatcher(idle)("cancel");
    expect(idle.fileList.setView).not.toHaveBeenCalled();
    expect(idle.fileList.loadDirectory).not.toHaveBeenCalled();
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
