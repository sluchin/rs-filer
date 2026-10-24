import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DualPaneContainer from "@/features/explorer/components/DualPaneContainer";
import FileList from "@/features/explorer/components/FileList";
import type { FileEntry, PaneState } from "@/features/explorer/types";

vi.mock("@/features/explorer/components/FileList", () => ({
  default: vi.fn(() => null),
}));

const entry = (name: string): FileEntry => ({
  name,
  path: `/h/${name}`,
  is_dir: false,
  size: 0,
  modified: null,
  readonly: false,
  hidden: false,
});

/** ペインの状態を作る. */
const pane = (files: FileEntry[], selectedIndex = 0): PaneState => ({
  currentPath: "/h",
  files,
  allFiles: files,
  selectedIndex,
  marks: [],
  showHidden: false,
  showDetails: true,
  sort: { key: "name", desc: false },
  filter: null,
  history: [],
  historyIndex: -1,
});

/** 変わらないハンドラー. */
const handlers = {
  onActivate: vi.fn(),
  onParent: vi.fn(),
  onParentClick: vi.fn(),
  onPathSubmit: vi.fn(),
  onFilterChange: vi.fn(),
  onItemClick: vi.fn(),
  onItemOpen: vi.fn(),
  onItemContextMenu: vi.fn(),
  registerPathInput: vi.fn(),
  registerFilterInput: vi.fn(),
  onColumnWidthChange: vi.fn(),
};

const WIDTHS = { left: {}, right: {} };

/** 一覧 (FileList) が, 指定したファイルで描画された回数. */
const renderCount = (files: FileEntry[]): number =>
  vi.mocked(FileList).mock.calls.filter(([props]) => props.files === files)
    .length;

describe("DualPaneContainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: 片方のペインの状態だけが変わったときは, もう片方のペインを描き直さない", () => {
    const leftFiles = [entry("a.txt")];
    const rightFiles = [entry("b.txt")];
    const right = pane(rightFiles);
    const { rerender } = render(
      <DualPaneContainer
        activePane="left"
        leftPane={pane(leftFiles, 0)}
        rightPane={right}
        overrides={{}}
        paneColumnWidths={WIDTHS}
        {...handlers}
      />,
    );
    expect(renderCount(rightFiles)).toBe(1);

    // 左ペインのカーソルだけを動かす.
    rerender(
      <DualPaneContainer
        activePane="left"
        leftPane={pane(leftFiles, -1)}
        rightPane={right}
        overrides={{}}
        paneColumnWidths={WIDTHS}
        {...handlers}
      />,
    );

    expect(renderCount(leftFiles)).toBe(2);
    expect(renderCount(rightFiles)).toBe(1);
  });

  it("正常系: ペインごとのハンドラーは, そのペインを付けて呼ぶ", () => {
    render(
      <DualPaneContainer
        activePane="left"
        leftPane={pane([])}
        rightPane={pane([])}
        overrides={{}}
        paneColumnWidths={WIDTHS}
        {...handlers}
      />,
    );
    const rightProps = vi.mocked(FileList).mock.calls[1][0];
    const file = entry("x.txt");

    rightProps.onItemClick(2, file);
    rightProps.onItemOpen(2, file);
    rightProps.onItemContextMenu(2, file, 5, 6);
    rightProps.onParent();
    rightProps.onParentClick();

    expect(handlers.onItemClick).toHaveBeenCalledWith("right", 2, file);
    expect(handlers.onItemOpen).toHaveBeenCalledWith("right", 2, file);
    expect(handlers.onItemContextMenu).toHaveBeenCalledWith(
      "right",
      2,
      file,
      5,
      6,
    );
    expect(handlers.onParent).toHaveBeenCalledWith("right");
    expect(handlers.onParentClick).toHaveBeenCalledWith("right");
  });
});
