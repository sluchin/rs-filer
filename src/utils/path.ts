/**
 * 階層パスを解析し, 1つ上の親ディレクトリのパスを返します.
 *
 * Windows のドライブレター (`C:/`) とバックスラッシュ区切りにも対応します.
 *
 * @param path - 対象のディレクトリパス.
 * @returns 親ディレクトリのパス. 移動できない場合 (パスが空またはルート) は null.
 */
export function getParentPath(path: string): string | null {
  const normalizedPath = path.replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  segments.pop();
  const isWindowsRoot = /^[a-zA-Z]:$/.test(segments[0] ?? "");
  if (segments.length === 0) {
    return "/";
  }
  if (isWindowsRoot && segments.length === 1) {
    return `${segments[0]}/`;
  }
  return (normalizedPath.startsWith("/") ? "/" : "") + segments.join("/");
}

/**
 * パスの末尾の名前 (ファイル名またはディレクトリ名) を返します.
 *
 * @param path - 対象のパス.
 * @returns 末尾の名前. ルートや空のパスの場合は空文字.
 */
export function getBaseName(path: string): string {
  const segments = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}
