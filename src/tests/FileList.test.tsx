import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FileList from "../features/explorer/components/FileList";
import type { FileEntry } from "../features/explorer/types";
import type { ColumnWidths } from "../features/settings/types";

const FILES: FileEntry[] = [
  {
    name: "docs",
    path: "/h/docs",
    is_dir: true,
    size: 0,
    modified: 1790000000,
    readonly: false,
    hidden: false,
  },
  {
    name: "b.txt",
    path: "/h/b.txt",
    is_dir: false,
    size: 10,
    modified: 1790000000,
    readonly: false,
    hidden: false,
  },
];

/** FileList を描画する. */
function renderList(
  columnWidths: ColumnWidths | undefined,
  hasParent = true,
  onColumnWidthChange: (widths: ColumnWidths) => void = () => {},
  files: FileEntry[] = FILES,
) {
  return render(
    <FileList
      files={files}
      selectedIndex={0}
      isActive={true}
      marks={[]}
      showDetails={true}
      hasParent={hasParent}
      onParent={() => {}}
      onParentClick={() => {}}
      onItemClick={() => {}}
      onItemOpen={() => {}}
      onItemContextMenu={() => {}}
      columnWidths={columnWidths}
      onColumnWidthChange={onColumnWidthChange}
    />,
  );
}

describe("FileList の列の位置", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  });

  it("正常系: 名前の列は, 幅を保存していなければ残りの幅を使い (属性の列がペインの右はじに合う), 他の列は保存した幅になること", () => {
    const { container } = renderList({ col_size: 85, col_date: 135 });

    const names = [
      container.querySelector(".file-header .col-name"),
      ...Array.from(container.querySelectorAll(".file-rows .col-name")),
    ];
    expect(names).toHaveLength(4);
    for (const name of names) {
      expect(name).toHaveStyle({ flex: "1" });
      expect((name as HTMLElement).style.width).toBe("");
    }
    // サイズ・更新日時の列は, ヘッダーも行も同じ保存した幅.
    for (const area of [".file-header", ".file-rows"]) {
      expect(container.querySelector(`${area} .col-size`)).toHaveStyle({
        width: "85px",
      });
      expect(container.querySelector(`${area} .col-date`)).toHaveStyle({
        width: "135px",
      });
    }
  });

  it("正常系: 名前の列の幅を保存していれば, 固定の幅になること. 行の名前の列は, アイコンの分 (21px) だけ狭いこと", () => {
    const { container } = renderList({ col_name: 400 });

    expect(container.querySelector(".file-header .col-name")).toHaveStyle({
      width: "400px",
      flex: "none",
    });
    const rowNames = container.querySelectorAll(".file-rows .col-name");
    expect(rowNames).toHaveLength(3);
    for (const name of Array.from(rowNames)) {
      expect(name).toHaveStyle({ width: "379px", flex: "none" });
    }
  });

  it("正常系: 列の幅の合計がペインより広くなるとき, ヘッダーと行を, その合計の幅以上にして横にスクロールさせること", () => {
    // 400 + 85 + 135 + 52 (属性の既定の幅) = 672.
    const { container } = renderList({
      col_name: 400,
      col_size: 85,
      col_date: 135,
    });

    expect(container.querySelector(".file-header-row")).toHaveStyle({
      minWidth: "672px",
    });
    for (const row of Array.from(container.querySelectorAll(".file-row"))) {
      expect(row).toHaveStyle({ minWidth: "672px" });
    }
  });

  it("正常系: 詳細を表示しないときは, 最小の幅を指定しないこと", () => {
    const { container } = render(
      <FileList
        files={FILES}
        selectedIndex={0}
        isActive={true}
        marks={[]}
        showDetails={false}
        hasParent={false}
        onParent={() => {}}
        onParentClick={() => {}}
        onItemClick={() => {}}
        onItemOpen={() => {}}
        onItemContextMenu={() => {}}
        columnWidths={{ col_name: 400 }}
      />,
    );

    expect(
      (container.querySelector(".file-header-row") as HTMLElement).style
        .minWidth,
    ).toBe("");
    expect(container.querySelector(".file-header .col-name")).toHaveStyle({
      flex: "1",
    });
  });

  it("正常系: 行の一覧を横にスクロールすると, ヘッダーも同じだけ動くこと", () => {
    const { container } = renderList({ col_name: 400 });
    const rows = container.querySelector(".file-rows") as HTMLElement;
    const headerRow = container.querySelector(
      ".file-header-row",
    ) as HTMLElement;

    rows.scrollLeft = 120;
    fireEvent.scroll(rows);
    expect(headerRow).toHaveStyle({ transform: "translateX(-120px)" });

    rows.scrollLeft = 0;
    fireEvent.scroll(rows);
    expect(headerRow.style.transform).toBe("");
  });

  it("正常系: 行の一覧にスクロールバーがあるとき, その幅の分だけ, ヘッダーの右に余白を足すこと", () => {
    // jsdom はレイアウトを行わないので, スクロールバーの幅 (オフセット幅 - 内側の幅) を差し替える.
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get: () => 542,
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 527,
    });

    const { container } = renderList({ col_name: 149 });

    expect(container.querySelector(".file-header")).toHaveStyle({
      paddingRight: "15px",
    });
  });

  it("正常系: スクロールバーが無い (幅 0) とき, ヘッダーに余白を足さないこと. ResizeObserver が無くても動くこと", () => {
    vi.stubGlobal("ResizeObserver", undefined);

    const { container } = renderList({ col_name: 149 });

    expect(container.querySelector(".file-header")).toHaveStyle({
      paddingRight: "0px",
    });
  });

  it("正常系: 幅の変化を監視して, 取り外すときに止めること", () => {
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = disconnect;
      },
    );

    const { unmount } = renderList(undefined);
    unmount();

    expect(disconnect).toHaveBeenCalled();
  });

  /** ヘッダーの列の位置 (右端と幅) を, 列ごとに差し替える. 名前 5→300, サイズ 72, 更新日時 136, 属性 52. */
  function stubColumnRects(): void {
    // 文字幅の測定 (canvas) は, jsdom では使えない. 測れない (幅 0) ものとして扱う.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const rects: Record<string, { right: number; width: number }> = {
      "col-name": { right: 300, width: 295 },
      "col-size": { right: 372, width: 72 },
      "col-date": { right: 508, width: 136 },
      "col-attr": { right: 560, width: 52 },
    };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const key = Object.keys(rects).find((k) => this.classList.contains(k));
        const r = key ? rects[key] : { right: 0, width: 0 };
        return {
          left: r.right - r.width,
          right: r.right,
          width: r.width,
          top: 0,
          bottom: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      },
    );
  }

  /** ヘッダーの, 指定した x の位置を押して, 指定した x まで動かして, 離す. */
  function dragHeader(
    container: HTMLElement,
    fromX: number,
    toX: number,
  ): void {
    const header = container.querySelector(".file-header") as HTMLElement;
    fireEvent.mouseDown(header, { clientX: fromX });
    fireEvent.mouseMove(document, { clientX: toX });
    fireEvent.mouseUp(document);
  }

  /** stubColumnRects の見た目の幅. 保存していない列は, ドラッグを始めるときにこの幅で固定される. */
  const VISIBLE = { col_name: 295, col_size: 72, col_date: 136, col_attr: 52 };

  it("正常系: 名前の右の境界を右へドラッグすると, 名前の列が同じだけ広がること. 保存していない列は, 今の見た目の幅で固定すること", () => {
    stubColumnRects();
    const changed = vi.fn();
    const { container } = renderList(undefined, true, changed);

    dragHeader(container, 300, 310);

    expect(changed).toHaveBeenCalledWith({ ...VISIBLE, col_name: 305 });
  });

  it("正常系: 名前の右の境界を左へドラッグすると, 名前の列が狭くなること. 保存した列の幅は, そのまま使うこと", () => {
    stubColumnRects();
    const changed = vi.fn();
    const { container } = renderList({ col_name: 320 }, true, changed);

    dragHeader(container, 300, 290);

    expect(changed).toHaveBeenCalledWith({ ...VISIBLE, col_name: 310 });
  });

  it("正常系: サイズの右の境界を右へドラッグすると, サイズの列が広がること (境界の右側の列は変わらない)", () => {
    stubColumnRects();
    const changed = vi.fn();
    const { container } = renderList({ col_size: 85 }, true, changed);

    dragHeader(container, 372, 380);

    expect(changed).toHaveBeenCalledWith({ ...VISIBLE, col_size: 93 });
  });

  it("正常系: 更新日時の右の境界を左へドラッグすると, 更新日時の列が狭くなること", () => {
    stubColumnRects();
    const changed = vi.fn();
    const { container } = renderList(undefined, true, changed);

    dragHeader(container, 508, 498);

    expect(changed).toHaveBeenCalledWith({ ...VISIBLE, col_date: 126 });
  });

  it("正常系: 一番右の属性の右の境界も, ドラッグで広げられること. ペインの幅を超えて広げられること", () => {
    stubColumnRects();
    const changed = vi.fn();
    const { container } = renderList(undefined, true, changed);

    dragHeader(container, 560, 960);

    expect(changed).toHaveBeenCalledWith({ ...VISIBLE, col_attr: 452 });
  });

  it("正常系: ドラッグの途中で, 動かし始めた位置からの差で幅を決めること (最小の幅で止まっても, 戻せば元に戻る)", () => {
    stubColumnRects();
    const changed = vi.fn();
    const { container } = renderList({ col_size: 100 }, true, changed);
    const header = container.querySelector(".file-header") as HTMLElement;

    fireEvent.mouseDown(header, { clientX: 372 });
    fireEvent.mouseMove(document, { clientX: 272 }); // 100 - 100 = 0 → 最小の 30
    fireEvent.mouseMove(document, { clientX: 362 }); // 100 - 10 = 90
    fireEvent.mouseUp(document);

    expect(changed).toHaveBeenNthCalledWith(1, { ...VISIBLE, col_size: 30 });
    expect(changed).toHaveBeenNthCalledWith(2, { ...VISIBLE, col_size: 90 });
  });

  it("境界: ドラッグしても, 列の幅は最小値 (30px) より狭くならないこと. 名前の列は, アイコンの分 (21px) を足した 51px", () => {
    stubColumnRects();
    const changed = vi.fn();
    const { container } = renderList({ col_size: 40 }, true, changed);

    dragHeader(container, 372, 100);
    dragHeader(container, 300, 0);

    expect(changed).toHaveBeenNthCalledWith(1, { ...VISIBLE, col_size: 30 });
    expect(changed).toHaveBeenNthCalledWith(2, {
      ...VISIBLE,
      col_size: 40,
      col_name: 51,
    });
  });

  it("正常系: マウスが境界線の上 (左右 6px 未満) にあるときだけ、ヘッダーのカーソルを col-resize にすること", () => {
    stubColumnRects();
    const { container } = renderList(undefined, true);
    const header = container.querySelector(".file-header") as HTMLElement;

    fireEvent.mouseMove(header, { clientX: 100 });
    expect(header.style.cursor).toBe("auto");
    fireEvent.mouseMove(header, { clientX: 305 });
    expect(header.style.cursor).toBe("col-resize");
    fireEvent.mouseMove(header, { clientX: 307 });
    expect(header.style.cursor).toBe("auto");
    fireEvent.mouseMove(header, { clientX: 295 });
    expect(header.style.cursor).toBe("col-resize");
    fireEvent.mouseLeave(header);
    expect(header.style.cursor).toBe("auto");
  });

  it("境界: ドラッグして離したあとは, マウスを動かしても幅を変えないこと", () => {
    stubColumnRects();
    const changed = vi.fn();
    const { container } = renderList(undefined, true, changed);

    dragHeader(container, 300, 310);
    fireEvent.mouseMove(document, { clientX: 400 });

    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("境界: 詳細を表示しない (名前の列だけ) ときは, 境界をドラッグしても何もしないこと", () => {
    stubColumnRects();
    const changed = vi.fn();
    const { container } = render(
      <FileList
        files={FILES}
        selectedIndex={0}
        isActive={true}
        marks={[]}
        showDetails={false}
        hasParent={false}
        onParent={() => {}}
        onParentClick={() => {}}
        onItemClick={() => {}}
        onItemOpen={() => {}}
        onItemContextMenu={() => {}}
        onColumnWidthChange={changed}
      />,
    );

    dragHeader(container, 300, 310);

    expect(changed).not.toHaveBeenCalled();
  });

  it("正常系: 境界のダブルクリックで, 境界の左側の列を内容に合わせた幅にすること", () => {
    stubColumnRects();
    const changed = vi.fn();
    const { container } = renderList({ col_size: 85 }, true, changed);
    const header = container.querySelector(".file-header") as HTMLElement;

    // jsdom では文字幅が 0 なので, 内容に合う幅は最小値 (名前はアイコンの分を足した 51px, ほかは 30px).
    fireEvent.doubleClick(header, { clientX: 300 });
    fireEvent.doubleClick(header, { clientX: 372 });
    fireEvent.doubleClick(header, { clientX: 508 });
    fireEvent.doubleClick(header, { clientX: 560 });

    expect(changed).toHaveBeenNthCalledWith(1, { col_size: 85, col_name: 51 });
    expect(changed).toHaveBeenNthCalledWith(2, { col_size: 30 });
    expect(changed).toHaveBeenNthCalledWith(3, { col_size: 85, col_date: 30 });
    expect(changed).toHaveBeenNthCalledWith(4, { col_size: 85, col_attr: 30 });
  });

  it("境界: 列の境界以外のダブルクリックでは, 何もしないこと", () => {
    stubColumnRects();
    const changed = vi.fn();
    const { container } = renderList({ col_size: 85 }, true, changed);

    fireEvent.doubleClick(
      container.querySelector(".file-header") as HTMLElement,
      {
        clientX: 100,
      },
    );

    expect(changed).not.toHaveBeenCalled();
  });

  it("正常系: 自動の幅合わせは, 表示する文字列 (整形した日時など) の幅で測ること. 生の数値で測って, 文字が切れないこと", () => {
    stubColumnRects();
    // 文字の幅を 1 文字 7px として測る.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 7 }),
      font: "",
    } as unknown as CanvasRenderingContext2D);
    const files: FileEntry[] = [
      { ...FILES[1], name: "longer_name.txt", size: 1234567 },
    ];
    const changed = vi.fn();
    const { container } = renderList({}, false, changed, files);
    const header = container.querySelector(".file-header") as HTMLElement;

    fireEvent.doubleClick(header, { clientX: 372 }); // サイズ
    fireEvent.doubleClick(header, { clientX: 508 }); // 更新日時
    fireEvent.doubleClick(header, { clientX: 560 }); // 属性

    // サイズ: "1234567" (7 文字) = 49 + 余白 9. (見出し "サイズ" = 21 より広い)
    expect(changed).toHaveBeenNthCalledWith(1, { col_size: 49 + 9 });
    // 更新日時: "YYYY/MM/DD HH:MM:SS" (19 文字) = 133 + 余白 9. 生の数値 "1790000000" (10 文字 = 70) ではない.
    expect(changed).toHaveBeenNthCalledWith(2, { col_date: 19 * 7 + 9 });
    // 属性: "-a-w-" (5 文字) = 35 + 余白 9.
    expect(changed).toHaveBeenNthCalledWith(3, { col_attr: 5 * 7 + 9 });
  });

  it("正常系: 見出しの方が広いときは, 見出しの幅に合わせること", () => {
    stubColumnRects();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 7 }),
      font: "",
    } as unknown as CanvasRenderingContext2D);
    const files: FileEntry[] = [{ ...FILES[1], modified: null, size: 1 }];
    const changed = vi.fn();
    const { container } = renderList({}, false, changed, files);
    const header = container.querySelector(".file-header") as HTMLElement;

    fireEvent.doubleClick(header, { clientX: 508 }); // 更新日時 (日時が無い)

    // 見出し "更新日時" (4 文字 = 28) + 余白 9 = 37.
    expect(changed).toHaveBeenCalledWith({ col_date: 4 * 7 + 9 });
  });
});
