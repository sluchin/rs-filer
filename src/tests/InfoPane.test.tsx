import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import InfoPane, { infoRows } from "../features/info/components/InfoPane";
import type { ItemInfo } from "../features/info/types";

/** 既定の値を持つ項目の詳細を作る. */
function makeInfo(overrides: Partial<ItemInfo> = {}): ItemInfo {
  return {
    name: "a.txt",
    path: "/h/a.txt",
    kind: "file",
    size: 12345,
    modified: 1790000000,
    created: 1780000000,
    accessed: 1790000100,
    readonly: false,
    hidden: false,
    permissions: "rw-r--r-- (0644)",
    symlink_target: null,
    extension: "txt",
    child_files: null,
    child_dirs: null,
    ...overrides,
  };
}

const IDLE = { status: "idle" } as const;
const labels = (rows: { label: string }[]): string[] =>
  rows.map((r) => r.label);

describe("infoRows", () => {
  it("正常系: ファイルは, 名前・場所・種類・拡張子・サイズ・日時・属性・権限を出し, ディレクトリ用の行は出さないこと", () => {
    const rows = infoRows(makeInfo(), IDLE);

    expect(labels(rows)).toEqual([
      "名前",
      "場所",
      "種類",
      "拡張子",
      "サイズ",
      "更新日時",
      "作成日時",
      "アクセス日時",
      "属性",
      "権限",
    ]);
    const get = (label: string) => rows.find((r) => r.label === label)?.value;
    expect(get("種類")).toBe("ファイル");
    expect(get("サイズ")).toBe("12,345 バイト (12.06KB)");
    expect(get("更新日時")).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(get("属性")).toBe("なし");
    expect(get("権限")).toBe("rw-r--r-- (0644)");
  });

  it("境界: 値が無い項目 (作成日時・権限・拡張子が不明) は行にせず, 1KB 未満のサイズは桁区切りだけであること. 属性は, 読み取り専用と隠しを並べること", () => {
    const rows = infoRows(
      makeInfo({
        size: 512,
        created: null,
        accessed: null,
        permissions: null,
        extension: null,
        readonly: true,
        hidden: true,
      }),
      IDLE,
    );

    expect(labels(rows)).toEqual([
      "名前",
      "場所",
      "種類",
      "サイズ",
      "更新日時",
      "属性",
    ]);
    expect(rows.find((r) => r.label === "サイズ")?.value).toBe("512 バイト");
    expect(rows.find((r) => r.label === "属性")?.value).toBe(
      "読み取り専用, 隠し",
    );
  });

  it("境界: 更新日時が取れないときは, 更新日時の行を出さないこと", () => {
    const rows = infoRows(makeInfo({ modified: null }), IDLE);

    expect(labels(rows)).not.toContain("更新日時");
    expect(labels(rows)).toContain("作成日時");
  });

  it("正常系: シンボリックリンクは, リンク先を出すこと", () => {
    const rows = infoRows(
      makeInfo({ kind: "symlink", symlink_target: "/real/target" }),
      IDLE,
    );

    expect(rows.find((r) => r.label === "種類")?.value).toBe(
      "シンボリックリンク",
    );
    expect(rows.find((r) => r.label === "リンク先")?.value).toBe(
      "/real/target",
    );
  });

  it("正常系: ディレクトリは, サイズ・拡張子を出さず, 直下の数と, 配下の合計 (計算中 → 完了) を出すこと", () => {
    const dir = makeInfo({
      kind: "dir",
      name: "docs",
      path: "/h/docs",
      size: 0,
      extension: null,
      child_files: 1200,
      child_dirs: 3,
    });

    const loading = infoRows(dir, { status: "loading" });
    expect(labels(loading)).not.toContain("サイズ");
    expect(labels(loading)).not.toContain("拡張子");
    expect(loading.find((r) => r.label === "直下")?.value).toBe(
      "ファイル 1,200 / ディレクトリ 3",
    );
    expect(loading.find((r) => r.label === "配下の合計")?.value).toBe(
      "計算中...",
    );

    const ready = infoRows(dir, {
      status: "ready",
      stats: { files: 5000, dirs: 40, bytes: 2048, errors: 0, complete: true },
    });
    expect(ready.find((r) => r.label === "配下の合計")?.value).toBe(
      "ファイル 5,000 / ディレクトリ 40 / 2,048 バイト (2KB)",
    );
  });

  it("境界: 途中まで・読めない項目があるときは, その旨を付けること. 計算に失敗したら, そのメッセージを出し, 対象外 (idle) なら行を出さないこと", () => {
    const dir = makeInfo({ kind: "dir", child_files: 0, child_dirs: 0 });

    const partial = infoRows(dir, {
      status: "ready",
      stats: { files: 1, dirs: 0, bytes: 10, errors: 2, complete: false },
    });
    expect(partial.find((r) => r.label === "配下の合計")?.value).toBe(
      "ファイル 1 / ディレクトリ 0 / 10 バイト (途中まで (時間または数の上限), 読めない項目 2 件)",
    );
    expect(
      infoRows(dir, { status: "error", message: "読めません" }).find(
        (r) => r.label === "配下の合計",
      )?.value,
    ).toBe("読めません");
    expect(labels(infoRows(dir, IDLE))).not.toContain("配下の合計");
  });
});

describe("InfoPane", () => {
  it("正常系: 取得できた詳細を, 見出しと値の組で表示すること", () => {
    render(
      <InfoPane info={{ status: "ready", info: makeInfo() }} stats={IDLE} />,
    );

    expect(
      screen.getByRole("region", { name: "info pane" }),
    ).toBeInTheDocument();
    expect(screen.getByText("サイズ")).toBeInTheDocument();
    expect(screen.getByText("12,345 バイト (12.06KB)")).toBeInTheDocument();
    expect(screen.getByText("/h/a.txt")).toBeInTheDocument();
  });

  it("正常系: 取得前・取得中・失敗を, それぞれ表示すること", () => {
    const { rerender } = render(<InfoPane info={IDLE} stats={IDLE} />);
    expect(
      screen.getByText("詳細を表示できる項目がありません."),
    ).toBeInTheDocument();

    rerender(<InfoPane info={{ status: "loading" }} stats={IDLE} />);
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();

    rerender(
      <InfoPane
        info={{ status: "error", message: "読めません" }}
        stats={IDLE}
      />,
    );
    expect(screen.getByText("読めません")).toBeInTheDocument();
  });
});
