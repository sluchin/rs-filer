/**
 * 階層パスを解析し, 1 つ上の親ディレクトリのパスを返します.
 *
 * Windows のドライブレター (`C:/`), バックスラッシュ区切り, UNC パス (`\\server\share\...`) にも
 * 対応します. ルート (`/`, ドライブレターの直下, UNC の共有直下) では, それ以上は上がれません.
 * Windows のパスの親は, `\` 区切り (`C:\Users`) で返します (`toNativePath`).
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
    // ルート直下まで上がった場合, ドライブは `C:\`, UNC は `\\server\share` の形に戻す.
    return toNativePath(isUnc ? `//${segments.join("/")}` : `${segments[0]}/`);
  }
  if (isDrive || isUnc) {
    return toNativePath((isUnc ? "//" : "") + segments.join("/"));
  }
  // ここに来るのは, ドライブでも UNC でもないパスだけ
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

/**
 * 2 つのパスが, 同じ場所を指すかを返します.
 *
 * 区切り (`/` と `\`) の違いと, 末尾の区切りの有無は無視します. Windows のパス (ドライブレター・UNC) は,
 * 大文字と小文字も区別しません.
 *
 * @param a - 比べるパス.
 * @param b - 比べるパス.
 * @returns 同じ場所を指すなら true.
 */
export function isSamePath(a: string, b: string): boolean {
  const normalize = (path: string): string => {
    const slashed = path.replace(/\\/g, "/");
    const trimmed = slashed.length > 1 ? slashed.replace(/\/+$/, "") : slashed;
    const windows = /^[a-zA-Z]:/.test(trimmed) || trimmed.startsWith("//");
    // ドライブの直下 (`C:`) は, 区切りを付けた形 (`C:/`) にそろえる
    const rooted = /^[a-zA-Z]:$/.test(trimmed) ? `${trimmed}/` : trimmed;
    return windows ? rooted.toLowerCase() : rooted;
  };
  return normalize(a) === normalize(b);
}

/**
 * Windows のパス (ドライブレター・UNC) の区切りを, `\` にそろえます. それ以外のパスは, そのまま返します.
 *
 * 親ディレクトリへの移動やパスの直接入力で `/` が入っても, バックエンドが返すパス (`\` 区切り) と
 * 同じ形にして, 履歴やブックマークで, 区切りが混ざらないようにします.
 *
 * @param path - 対象のパス.
 * @returns 区切りをそろえたパス.
 */
export function toNativePath(path: string): string {
  const windows = /^[a-zA-Z]:/.test(path) || /^[/\\]{2}/.test(path);
  return windows ? path.replace(/\//g, "\\") : path;
}

/**
 * パスの一覧の区切りをそろえ (`toNativePath`), 重複を除きます (最初に出てきたものを残します).
 *
 * @param paths - 対象のパスの一覧.
 * @returns 区切りをそろえて, 重複を除いた一覧.
 */
export function uniqueNativePaths(paths: readonly string[]): string[] {
  return [...new Set(paths.map(toNativePath))];
}
