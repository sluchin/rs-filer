import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import log from "loglevel";

// 開発環境では debug 以上、本番では warn 以上を出力
if (import.meta.env.DEV) {
  log.setLevel("debug");
} else {
  log.setLevel("warn");
}

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>("/");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

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
