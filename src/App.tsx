import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import log from "loglevel";

// 開発環境では debug 以上、本番では warn 以上を出力
if (import.meta.env.DEV) {
  log.setLevel("debug");
} else {
  log.setLevel("warn");
}

/**
 * ファイルまたはディレクトリのエントリ情報を表すインターフェース
 */
export interface FileEntry {
  /** ファイルまたはディレクトリの名前 */
  name: string;
  /** ファイルシステム上の絶対パス */
  path: string;
  /** ディレクトリである場合は true、ファイルの場合は false */
  is_dir: boolean;
}

/**
 * rsfiler のメインアプリケーションコンポーネント。
 * ディレクトリの閲覧、親ディレクトリへの移動、ファイル一覧の表示機能を提供します。
 *
 * @returns rsfiler のメインUI要素
 */
export default function App() {
  /** 現在表示中のディレクトリパス */
  const [currentPath, setCurrentPath] = useState<string>("/");
  /** 現在のディレクトリに含まれるファイル・ディレクトリ一覧 */
  const [files, setFiles] = useState<FileEntry[]>([]);
  /** エラーメッセージ（発生時のみ文字列、正常時は null） */
  const [error, setError] = useState<string | null>(null);

  /**
   * 指定されたパスのディレクトリ内容を取得し、状態を更新する非同期関数。
   *
   * @param targetPath - 読み込み対象のディレクトリ絶対パス
   */
  const loadDirectory = async (targetPath: string) => {
    try {
      setError(null);
      log.debug("[React] ディレクトリ読み込み要求:", targetPath);

      const result = await invoke<FileEntry[]>("read_directory", {
        path: targetPath,
      });
      setFiles(result);
      setCurrentPath(targetPath);

      log.info(`[React] ディレクトリ取得完了: ${result.length} 件`);
    } catch (e) {
      log.error("[React] ディレクトリ読み込み失敗:", e);
      setError(String(e));
    }
  };

  useEffect(() => {
    /**
     * アプリ起動時の初期化処理。
     * ホームディレクトリの取得を試み、失敗した場合はルート ("/") を読み込みます。
     */
    const init = async () => {
      try {
        const home = await invoke<string>("get_home_dir");
        loadDirectory(home);
      } catch {
        loadDirectory("/");
      }
    };
    init();
  }, []);

  /**
   * 階層パスを解析し、一つ上の親ディレクトリへ移動するハンドラー。
   */
  const handleParentDir = () => {
    const parent =
      currentPath.split("/").filter(Boolean).slice(0, -1).join("/") || "/";
    loadDirectory(parent.startsWith("/") ? parent : "/" + parent);
  };

  return (
    <div style={{ padding: "1.5rem", fontFamily: "sans-serif" }}>
      <h2>rsfiler Prototype</h2>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button onClick={handleParentDir}>⬆ 親ディレクトリへ</button>
        <input
          type="text"
          value={currentPath}
          onChange={(e) => setCurrentPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadDirectory(currentPath)}
          style={{ flex: 1, padding: "0.4rem" }}
        />
      </div>

      {error && <p style={{ color: "red" }}>エラー: {error}</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {files.map((file) => (
          <li
            key={file.path}
            onClick={() => file.is_dir && loadDirectory(file.path)}
            style={{
              padding: "0.4rem",
              cursor: file.is_dir ? "pointer" : "default",
              borderBottom: "1px solid #eee",
              display: "flex",
              gap: "0.5rem",
            }}
          >
            <span>{file.is_dir ? "📁" : "📄"}</span>
            <span style={{ fontWeight: file.is_dir ? "bold" : "normal" }}>
              {file.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
