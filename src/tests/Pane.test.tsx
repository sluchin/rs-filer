import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FileList from "../features/explorer/components/FileList";
import Pane from "../features/explorer/components/Pane";
import type { PaneState } from "../features/explorer/types";

vi.mock("../features/explorer/components/FileList", () => ({
  default: vi.fn(() => null),
}));

const STATE: PaneState = {
  currentPath: "/h",
  files: [],
  allFiles: [],
  selectedIndex: 0,
  marks: [],
  showHidden: false,
  showDetails: true,
  sort: { key: "name", desc: false },
  filter: null,
  history: [],
  historyIndex: -1,
};

describe("Pane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: そのペインの列幅を一覧に渡し, 一覧で変えた列幅を, ペインを付けて知らせること", () => {
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
        onParentClick={vi.fn()}
        onItemClick={vi.fn()}
        onItemOpen={vi.fn()}
        onItemContextMenu={vi.fn()}
        pathInputRef={vi.fn()}
        filterInputRef={vi.fn()}
        paneColumnWidths={{ left: { col_name: 100 }, right: { col_name: 200 } }}
        onColumnWidthChange={onColumnWidthChange}
      />,
    );
    const props = vi.mocked(FileList).mock.calls[0][0];

    expect(props.columnWidths).toEqual({ col_name: 200 });
    props.onColumnWidthChange?.({ col_name: 250 });
    expect(onColumnWidthChange).toHaveBeenCalledWith("right", {
      col_name: 250,
    });
  });
});
