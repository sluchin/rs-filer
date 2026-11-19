import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FileList from "@/features/explorer/components/FileList";
import Pane from "@/features/explorer/components/Pane";
import type { PaneState } from "@/features/explorer/types";

vi.mock("@/features/explorer/components/FileList", () => ({
  default: vi.fn(() => null),
}));

const STATE: PaneState = {
  currentPath: "/h",
  files: [],
  allFiles: [],
  selectedIndex: 0,
  marks: [],
  flags: [],
  showHidden: false,
  showDetails: true,
  sort: { key: "name", desc: false },
  filter: null,
  search: null,
  history: [],
  historyIndex: -1,
};

describe("Pane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: そのペインの列幅を一覧に渡し, 一覧で変えた列幅を, 開いているディレクトリのパスを付けて知らせること", () => {
    const onColumnWidthChange = vi.fn();
    render(
      <Pane
        paneId="right"
        state={STATE}
        isActive
        onActivate={vi.fn()}
        onParent={vi.fn()}
        onPathSubmit={vi.fn()}
        onFilterChange={vi.fn()}
        onFilterMove={vi.fn()}
        onParentClick={vi.fn()}
        onItemClick={vi.fn()}
        onItemOpen={vi.fn()}
        onItemContextMenu={vi.fn()}
        pathInputRef={vi.fn()}
        filterInputRef={vi.fn()}
        paneColumnWidths={{ left: { col_name: 100 }, right: { col_name: 200 } }}
        dirColumnWidths={{ "/other": { col_name: 999 } }}
        onColumnWidthChange={onColumnWidthChange}
      />,
    );
    const props = vi.mocked(FileList).mock.calls[0][0];

    expect(props.columnWidths).toEqual({ col_name: 200 });
    props.onColumnWidthChange?.({ col_name: 250 });
    expect(onColumnWidthChange).toHaveBeenCalledWith(STATE.currentPath, {
      col_name: 250,
    });
  });

  it("正常系: 開いているディレクトリの列幅の設定があれば, ペインの設定より優先すること", () => {
    render(
      <Pane
        paneId="right"
        state={STATE}
        isActive
        onActivate={vi.fn()}
        onParent={vi.fn()}
        onPathSubmit={vi.fn()}
        onFilterChange={vi.fn()}
        onFilterMove={vi.fn()}
        onParentClick={vi.fn()}
        onItemClick={vi.fn()}
        onItemOpen={vi.fn()}
        onItemContextMenu={vi.fn()}
        pathInputRef={vi.fn()}
        filterInputRef={vi.fn()}
        paneColumnWidths={{ left: {}, right: { col_name: 200 } }}
        dirColumnWidths={{ [STATE.currentPath]: { col_name: 640 } }}
        onColumnWidthChange={vi.fn()}
      />,
    );

    expect(vi.mocked(FileList).mock.calls[0][0].columnWidths).toEqual({
      col_name: 640,
    });
  });

  it("正常系: 絞り込み入力中の ↓ と ↑ は, カーソルを動かすハンドラーを呼ぶこと", () => {
    const onFilterMove = vi.fn();
    render(
      <Pane
        paneId="right"
        state={{ ...STATE, filter: "a" }}
        isActive
        onActivate={vi.fn()}
        onParent={vi.fn()}
        onPathSubmit={vi.fn()}
        onFilterChange={vi.fn()}
        onFilterMove={onFilterMove}
        onParentClick={vi.fn()}
        onItemClick={vi.fn()}
        onItemOpen={vi.fn()}
        onItemContextMenu={vi.fn()}
        pathInputRef={vi.fn()}
        filterInputRef={vi.fn()}
        paneColumnWidths={{ left: {}, right: {} }}
        onColumnWidthChange={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("right filter");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });

    expect(onFilterMove).toHaveBeenNthCalledWith(1, 1);
    expect(onFilterMove).toHaveBeenNthCalledWith(2, -1);
  });
});
