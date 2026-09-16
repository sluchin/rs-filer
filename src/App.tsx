import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactElement,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import log from "loglevel";

// 開発環境では debug 以上, 本番では warn 以上を出力.
if (import.meta.env.DEV) {
  log.setLevel("debug");
} else {
  log.setLevel("warn");
}

/**
 * ファイルまたはディレクトリのエントリ情報を表すインターフェース.
 */
export interface FileEntry {
  /**
   * ファイルまたはディレクトリの名前.
   */
  name: string;
  /**
   * ファイルシステム上の絶対パス.
   */
  path: string;
  /**
   * ディレクトリである場合は true, ファイルの場合は false.
   */
  is_dir: boolean;
}

/**
 * 操作対象ペインを識別するための識別子型.
 */
export type PaneId = "left" | "right";

/**
 * 各ペインの表示状態を管理するインターフェース.
 */
export interface PaneState {
  /**
   * 現在表示しているディレクトリの絶対パス.
   */
  currentPath: string;
  /**
   * 現在のディレクトリ内に存在するファイルおよびディレクトリの一覧.
   */
  files: FileEntry[];
  /**
   * 現在フォーカスまたは選択されている項目のインデックス.
   */
  selectedIndex: number;
}

/**
 * rsfiler のメインアプリケーションコンポーネント.
 * 2ペインによるディレクトリの閲覧, ファイル一覧の表示, 親ディレクトリへの移動, およびファイルコピー機能を提供します.
 *
 * @returns rsfiler のメインUI要素.
 */
export default function App(): ReactElement {
  const [activePane, setActivePane] = useState<PaneId>("left");
  const [error, setError] = useState<string | null>(null);

  const [leftPane, setLeftPane] = useState<PaneState>({
    currentPath: "/",
    files: [],
    selectedIndex: 0,
  });

  const [rightPane, setRightPane] = useState<PaneState>({
    currentPath: "/",
    files: [],
    selectedIndex: 0,
  });

  /**
   * 指定されたパスのディレクトリ内容を取得し, 対象ペインの状態を更新する非同期関数.
   *
   * @param pane - 更新対象のペイン識別子 ('left' | 'right').
   * @param targetPath - 読み込み対象のディレクトリ絶対パス.
   */
  const loadDirectory = useCallback(
    async (pane: PaneId, targetPath: string): Promise<void> => {
      try {
        setError(null);
        log.debug(`[React] ${pane}ペイン 読み込み要求:`, targetPath);

        const result = await invoke<FileEntry[]>("read_directory", {
          path: targetPath,
        });

        const updateState = (prev: PaneState): PaneState => ({
          ...prev,
          currentPath: targetPath,
          files: result,
          selectedIndex: Math.min(
            prev.selectedIndex,
            Math.max(0, result.length - 1),
          ),
        });

        if (pane === "left") {
          setLeftPane(updateState);
        } else {
          setRightPane(updateState);
        }

        log.info(`[React] ${pane}ペイン 取得完了: ${result.length} 件`);
      } catch (e) {
        log.error(`[React] ${pane}ペイン 読み込み失敗:`, e);
        setError(String(e));
      }
    },
    [],
  );

  /**
   * アクティブなペインの選択項目を非アクティブな対向ペインへコピーするハンドラー.
   */
  const handleCopy = useCallback(async (): Promise<void> => {
    const activeState = activePane === "left" ? leftPane : rightPane;
    const targetState = activePane === "left" ? rightPane : leftPane;
    const targetPaneId: PaneId = activePane === "left" ? "right" : "left";

    const selectedFile = activeState.files[activeState.selectedIndex];
    if (!selectedFile) {
      setError("コピー対象の項目が選択されていません.");
      return;
    }

    try {
      setError(null);
      log.debug(
        `[React] コピー開始: ${selectedFile.path} -> ${targetState.currentPath}`,
      );

      await invoke("copy_item", {
        srcPath: selectedFile.path,
        destDir: targetState.currentPath,
      });

      // コピー完了後, 対向ペインの内容を最新に更新
      await loadDirectory(targetPaneId, targetState.currentPath);
      log.info(`[React] コピー完了: ${selectedFile.name}`);
    } catch (e) {
      log.error(`[React] コピー失敗:`, e);
      setError(String(e));
    }
  }, [activePane, leftPane, rightPane, loadDirectory]);

  /** 最新の handleCopy 関数を参照するための ref. */
  const handleCopyRef = useRef<() => Promise<void>>(handleCopy);
  useEffect(() => {
    handleCopyRef.current = handleCopy;
  }, [handleCopy]);

  // 初期化: 左右ともにホームディレクトリを開く
  useEffect(() => {
    /**
     * アプリ起動時の初期化処理.
     * ホームディレクトリの取得を試み, 失敗した場合はルート ("/") を読み込みます.
     */
    const init = async (): Promise<void> => {
      let home = "/";
      try {
        home = await invoke<string>("get_home_dir");
      } catch (e) {
        log.warn("[React] ホームディレクトリ取得失敗, ルートを使用します:", e);
        home = "/";
      }
      await Promise.all([
        loadDirectory("left", home),
        loadDirectory("right", home),
      ]);
    };
    init();
  }, [loadDirectory]);

  // キーボードショートカット (F5 キーでコピー) の登録
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key === "F5") {
        e.preventDefault();
        handleCopyRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  /**
   * 階層パスを解析し, 1つ上の親ディレクトリへ移動するハンドラー.
   *
   * @param pane - 対象のペイン識別子 ('left' | 'right').
   */
  const handleParentDir = useCallback(
    (pane: PaneId): void => {
      const targetState = pane === "left" ? leftPane : rightPane;
      const normalizedPath = targetState.currentPath.replace(/\\/g, "/");
      const segments = normalizedPath.split("/").filter(Boolean);

      if (segments.length === 0) {
        return;
      }

      segments.pop();
      const isWindowsRoot = /^[a-zA-Z]:$/.test(segments[0] ?? "");
      let parent: string;
      if (segments.length === 0) {
        parent = "/";
      } else if (isWindowsRoot && segments.length === 1) {
        parent = `${segments[0]}/`;
      } else {
        parent =
          (normalizedPath.startsWith("/") ? "/" : "") + segments.join("/");
      }

      loadDirectory(pane, parent);
    },
    [leftPane, rightPane, loadDirectory],
  );

  /**
   * 指定したペインのUIコンポーネントをレンダリングする関数.
   *
   * @param paneId - レンダリング対象のペイン識別子 ('left' | 'right').
   * @param state - レンダリング対象のペイン状態.
   * @returns ペインのReact要素.
   */
  const renderPane = (paneId: PaneId, state: PaneState): ReactElement => {
    const isActive = activePane === paneId;

    return (
      <div
        role="region"
        aria-label={`${paneId} pane`}
        onClick={() => setActivePane(paneId)}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          border: isActive ? "2px solid #0066cc" : "1px solid #ccc",
          borderRadius: "4px",
          padding: "0.75rem",
          background: isActive ? "#fafafa" : "#ffffff",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <button type="button" onClick={() => handleParentDir(paneId)}>
            ⬆ 親
          </button>
          {isActive && (
            <button
              type="button"
              onClick={handleCopy}
              title="対向ペインへコピー (F5)"
            >
              📋 コピー
            </button>
          )}
          <input
            type="text"
            value={state.currentPath}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const val = e.target.value;
              if (paneId === "left") {
                setLeftPane((p) => ({ ...p, currentPath: val }));
              } else {
                setRightPane((p) => ({ ...p, currentPath: val }));
              }
            }}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                loadDirectory(paneId, state.currentPath);
              }
            }}
            style={{ flex: 1, padding: "0.25rem 0.4rem" }}
          />
        </div>

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            flex: 1,
            overflowY: "auto",
          }}
        >
          {state.files.map((file, idx) => {
            const isSelected = isActive && state.selectedIndex === idx;
            return (
              <li
                key={file.path}
                onClick={() => {
                  setActivePane(paneId);
                  if (paneId === "left") {
                    setLeftPane((p) => ({ ...p, selectedIndex: idx }));
                  } else {
                    setRightPane((p) => ({ ...p, selectedIndex: idx }));
                  }

                  if (file.is_dir) {
                    loadDirectory(paneId, file.path);
                  }
                }}
                style={{
                  padding: "0.3rem 0.5rem",
                  cursor: file.is_dir ? "pointer" : "default",
                  background: isSelected ? "#0066cc" : "transparent",
                  color: isSelected ? "#ffffff" : "#000000",
                  display: "flex",
                  gap: "0.5rem",
                  userSelect: "none",
                }}
              >
                <span>{file.is_dir ? "📁" : "📄"}</span>
                <span
                  style={{
                    fontWeight: file.is_dir ? "bold" : "normal",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {file.name}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div
      style={{
        padding: "1rem",
        fontFamily: "sans-serif",
        height: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {error && (
        <p style={{ color: "red", margin: "0 0 0.5rem 0" }}>エラー: {error}</p>
      )}

      <main style={{ flex: 1, display: "flex", gap: "1rem", minHeight: 0 }}>
        {renderPane("left", leftPane)}
        {renderPane("right", rightPane)}
      </main>
    </div>
  );
}
