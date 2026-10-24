import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntry, PaneState } from "@/features/explorer/types";
import { useTransfer } from "@/features/operations/hooks/useTransfer";
import {
  checkConflicts,
  checkNestedConflicts,
  checkStaleOverwrites,
  copyFilesToClipboard,
  readClipboardFiles,
  runTransfer,
} from "@/services/tauriApi";

vi.mock("@/services/tauriApi", () => ({
  cancelTransfer: vi.fn(),
  checkConflicts: vi.fn(),
  checkNestedConflicts: vi.fn(),
  checkStaleOverwrites: vi.fn(),
  copyFilesToClipboard: vi.fn(),
  readClipboardFiles: vi.fn(),
  runTransfer: vi.fn(),
}));

const entry = (name: string, dir = "/src"): FileEntry => ({
  name,
  path: `${dir}/${name}`,
  is_dir: false,
  size: 0,
  modified: null,
  readonly: false,
  hidden: false,
});

/** ペインの状態を作る. */
const pane = (
  currentPath: string,
  files: FileEntry[] = [],
  marks: string[] = [],
): PaneState => ({
  currentPath,
  files,
  allFiles: files,
  selectedIndex: 0,
  marks,
  showHidden: false,
  showDetails: true,
  sort: { key: "name", desc: false },
  filter: null,
  history: [],
  historyIndex: -1,
});

/** 左ペインをアクティブにして, フックを描画する. */
function renderTransfer(left: PaneState, right: PaneState) {
  const deps = {
    updatePane: vi.fn(),
    loadDirectory: vi.fn(() => Promise.resolve()),
    setError: vi.fn(),
    notify: vi.fn(),
    openConfirm: vi.fn(),
    openPrompt: vi.fn(),
    openChoice: vi.fn(),
  };
  const { result } = renderHook(() =>
    useTransfer({
      activePane: "left",
      leftPane: left,
      rightPane: right,
      ...deps,
    }),
  );
  return { result, ...deps };
}

const SUMMARY = { processed: 1, cancelled: false };

describe("useTransfer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runTransfer).mockResolvedValue(SUMMARY);
    vi.mocked(checkConflicts).mockResolvedValue([]);
    vi.mocked(checkNestedConflicts).mockResolvedValue([]);
    vi.mocked(checkStaleOverwrites).mockResolvedValue([]);
  });

  describe("startCopy (同じディレクトリ)", () => {
    it("正常系: 対向ペインが同じディレクトリなら, 名前を聞いて, その名前でコピーすること", async () => {
      const file = entry("a.txt");
      const { result, openPrompt } = renderTransfer(
        pane("/src", [file]),
        pane("/src"),
      );

      await act(() => result.current.startCopy(false));

      expect(openPrompt).toHaveBeenCalledWith(
        "名前を付けてコピー",
        expect.any(Function),
        "a.txt",
      );
      await act(async () => openPrompt.mock.calls[0][1]("b.txt"));
      expect(runTransfer).toHaveBeenCalledWith(
        {
          kind: "copy",
          sources: ["/src/a.txt"],
          dest_dir: "/src",
          overwrite: false,
          permanent: false,
          dest_name: "b.txt",
        },
        expect.any(Function),
      );
    });

    it("異常系: 対向ペインが同じディレクトリで, 2 件以上なら, エラーにすること", async () => {
      const files = [entry("a.txt"), entry("b.txt")];
      const { result, setError, openPrompt } = renderTransfer(
        pane("/src", files, ["/src/a.txt", "/src/b.txt"]),
        pane("/src"),
      );

      await act(() => result.current.startCopy(false));

      expect(setError).toHaveBeenCalledWith("1 件だけコピーしてください.");
      expect(openPrompt).not.toHaveBeenCalled();
    });
  });

  describe("copyToClipboard", () => {
    it("正常系: 対象のパスをクリップボードへコピーし, 件数を知らせること", async () => {
      vi.mocked(copyFilesToClipboard).mockResolvedValue();
      const files = [entry("a.txt"), entry("b.txt")];
      const { result, notify } = renderTransfer(
        pane("/src", files, ["/src/a.txt", "/src/b.txt"]),
        pane("/dst"),
      );

      act(() => result.current.copyToClipboard());

      expect(copyFilesToClipboard).toHaveBeenCalledWith([
        "/src/a.txt",
        "/src/b.txt",
      ]);
      await waitFor(() =>
        expect(notify).toHaveBeenCalledWith("2 件をコピーしました"),
      );
    });

    it("異常系: コピーに失敗したら, エラーを表示すること", async () => {
      vi.mocked(copyFilesToClipboard).mockRejectedValue("no clipboard");
      const { result, setError } = renderTransfer(
        pane("/src", [entry("a.txt")]),
        pane("/dst"),
      );

      act(() => result.current.copyToClipboard());

      await waitFor(() =>
        expect(setError).toHaveBeenCalledWith("no clipboard"),
      );
    });

    it("境界: 対象が無ければ, エラーにして, コピーしないこと", () => {
      const { result, setError } = renderTransfer(pane("/src"), pane("/dst"));

      act(() => result.current.copyToClipboard());

      expect(setError).toHaveBeenCalledWith("対象の項目が選択されていません.");
      expect(copyFilesToClipboard).not.toHaveBeenCalled();
    });
  });

  describe("pasteFromClipboard", () => {
    it("異常系: クリップボードが空なら, エラーにすること", async () => {
      vi.mocked(readClipboardFiles).mockResolvedValue([]);
      const { result, setError } = renderTransfer(pane("/src"), pane("/dst"));

      await act(() => result.current.pasteFromClipboard());

      expect(setError).toHaveBeenCalledWith("クリップボードが空です.");
    });

    it("異常系: 今のディレクトリのファイルが 2 件以上なら, エラーにすること", async () => {
      vi.mocked(readClipboardFiles).mockResolvedValue([
        "/src/a.txt",
        "/src/b.txt",
      ]);
      const { result, setError, openPrompt } = renderTransfer(
        pane("/src"),
        pane("/dst"),
      );

      await act(() => result.current.pasteFromClipboard());

      expect(setError).toHaveBeenCalledWith("1 件だけコピーしてください.");
      expect(openPrompt).not.toHaveBeenCalled();
    });

    it("異常系: クリップボードを読めなければ, エラーを表示すること", async () => {
      vi.mocked(readClipboardFiles).mockRejectedValue("read failed");
      const { result, setError } = renderTransfer(pane("/src"), pane("/dst"));

      await act(() => result.current.pasteFromClipboard());

      expect(setError).toHaveBeenCalledWith("read failed");
      expect(runTransfer).not.toHaveBeenCalled();
    });

    it("異常系: 同名の確認に失敗したら, エラーを表示し, コピーしないこと", async () => {
      vi.mocked(readClipboardFiles).mockResolvedValue(["/other/a.txt"]);
      vi.mocked(checkConflicts).mockRejectedValue("check failed");
      const { result, setError } = renderTransfer(pane("/src"), pane("/dst"));

      await act(() => result.current.pasteFromClipboard());

      expect(setError).toHaveBeenCalledWith("check failed");
      expect(runTransfer).not.toHaveBeenCalled();
    });

    it("正常系: 別のディレクトリのファイルで, 同名のものが無ければ, 確認せずにコピーすること", async () => {
      vi.mocked(readClipboardFiles).mockResolvedValue(["/other/a.txt"]);
      const { result, openConfirm } = renderTransfer(
        pane("/src"),
        pane("/dst"),
      );

      await act(() => result.current.pasteFromClipboard());

      expect(openConfirm).not.toHaveBeenCalled();
      expect(runTransfer).toHaveBeenCalledWith(
        {
          kind: "copy",
          sources: ["/other/a.txt"],
          dest_dir: "/src",
          overwrite: false,
          permanent: false,
        },
        expect.any(Function),
      );
    });
  });

  describe("duplicateFile", () => {
    it("正常系: 名前を聞いて, 同じディレクトリに, その名前でコピーすること", async () => {
      const { result, openPrompt } = renderTransfer(
        pane("/src", [entry("a.txt")]),
        pane("/dst"),
      );

      act(() => result.current.duplicateFile());

      expect(openPrompt).toHaveBeenCalledWith(
        "名前を付けてコピー",
        expect.any(Function),
        "a.txt",
      );
      await act(async () => openPrompt.mock.calls[0][1]("copy.txt"));
      expect(runTransfer).toHaveBeenCalledWith(
        {
          kind: "copy",
          sources: ["/src/a.txt"],
          dest_dir: "/src",
          overwrite: false,
          permanent: false,
          dest_name: "copy.txt",
        },
        expect.any(Function),
      );
    });

    it("境界: 対象が無ければ, エラーにすること", () => {
      const { result, setError, openPrompt } = renderTransfer(
        pane("/src"),
        pane("/dst"),
      );

      act(() => result.current.duplicateFile());

      expect(setError).toHaveBeenCalledWith("対象の項目が選択されていません.");
      expect(openPrompt).not.toHaveBeenCalled();
    });

    it("異常系: 2 件以上なら, エラーにすること", () => {
      const files = [entry("a.txt"), entry("b.txt")];
      const { result, setError, openPrompt } = renderTransfer(
        pane("/src", files, ["/src/a.txt", "/src/b.txt"]),
        pane("/dst"),
      );

      act(() => result.current.duplicateFile());

      expect(setError).toHaveBeenCalledWith("1 件だけコピーしてください.");
      expect(openPrompt).not.toHaveBeenCalled();
    });
  });

  describe("再読み込み", () => {
    it("正常系: 終わった時点で, 移動元か送り先を開いているペインだけを, 履歴を変えずに再読み込みすること", async () => {
      const files = [entry("a.txt"), entry("b.txt")];
      let finish = (): void => {};
      vi.mocked(runTransfer).mockReturnValue(
        new Promise((resolve) => {
          finish = () => resolve(SUMMARY);
        }),
      );
      const deps = {
        updatePane: vi.fn(),
        loadDirectory: vi.fn(() => Promise.resolve()),
        setError: vi.fn(),
        notify: vi.fn(),
        openConfirm: vi.fn(),
        openPrompt: vi.fn(),
        openChoice: vi.fn(),
      };
      const { result, rerender } = renderHook(
        ({ left, right }: { left: PaneState; right: PaneState }) =>
          useTransfer({
            activePane: "left",
            leftPane: left,
            rightPane: right,
            ...deps,
          }),
        {
          initialProps: {
            left: pane("/src", files, ["/src/a.txt"]),
            right: pane("/dest"),
          },
        },
      );

      let started: Promise<void> = Promise.resolve();
      act(() => {
        started = result.current.startCopy(false);
      });
      await waitFor(() => expect(runTransfer).toHaveBeenCalled());
      // 実行中に, 右ペインは別のディレクトリへ, 左ペインは送り先へ移る
      rerender({
        left: { ...pane("/dest"), historyIndex: 3 },
        right: pane("/other"),
      });
      await act(async () => {
        finish();
        await started;
      });

      expect(deps.loadDirectory).toHaveBeenCalledTimes(1);
      expect(deps.loadDirectory).toHaveBeenCalledWith("left", "/dest", {
        keepCursor: true,
        historyIndex: 3,
      });
      // マークは, 操作した項目の分だけ外す
      const updater = deps.updatePane.mock.calls[0][1] as (
        p: PaneState,
      ) => PaneState;
      expect(
        updater(pane("/src", files, ["/src/a.txt", "/src/b.txt"])).marks,
      ).toEqual(["/src/b.txt"]);
    });
  });
});
