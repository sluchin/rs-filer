/**
 * 階層パスを解析し, 1つ上の親ディレクトリのパスを返します.
 *
 * Windows のドライブレター (`C:/`), バックスラッシュ区切り, UNC パス (`\\server\share\...`) にも
 * 対応します. ルート (`/`, ドライブレターの直下, UNC の共有直下) では, それ以上は上がれません.
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

  const isUnc = normalizedPath.startsWith("//");
  const isDrive = /^[a-zA-Z]:$/.test(segments[0]);
  // ルートの深さ: 通常のパスは 0 (「/」), ドライブレターは 1 (「C:/」),
  // UNC は 2 (「//server/share」, サーバー名と共有名の 2 段).
  const rootDepth = isUnc ? 2 : isDrive ? 1 : 0;

  if (segments.length <= rootDepth) {
    return null;
  }

  segments.pop();
  if (segments.length === rootDepth && (isDrive || isUnc)) {
    // ルート直下まで上がった場合, ドライブは `C:/`, UNC は `//server/share` の形に戻す.
    return isUnc ? `//${segments.join("/")}` : `${segments[0]}/`;
  }
  return (
    (isUnc ? "//" : normalizedPath.startsWith("/") ? "/" : "") +
    segments.join("/")
  );
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
