/**
 * ファイル一覧とツリーのアイコンの種類.
 */
export type FileKind =
  | "dir"
  | "parent"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "code"
  | "script"
  | "executable"
  | "config"
  | "text"
  | "font"
  | "file";

/** 拡張子 (小文字. `.` を除く) から, 種類への対応. */
const EXTENSIONS: Record<string, FileKind> = {};

/**
 * 拡張子の一覧を, 種類に割り当てます.
 *
 * @param kind - 種類.
 * @param extensions - 空白で区切った拡張子.
 */
function assign(kind: FileKind, extensions: string): void {
  for (const ext of extensions.split(" ")) {
    EXTENSIONS[ext] = kind;
  }
}

assign(
  "image",
  "png jpg jpeg gif bmp webp svg ico tif tiff heic heif avif psd xcf raw cr2 nef",
);
assign("video", "mp4 mkv avi mov wmv webm flv m4v mpg mpeg 3gp ogv");
assign("audio", "mp3 wav flac aac ogg oga m4a wma opus mid midi aiff");
assign(
  "archive",
  "zip tar gz tgz bz2 tbz xz txz 7z rar zst lz lzh lha cab iso dmg deb rpm jar war apk",
);
assign("pdf", "pdf");
assign("document", "doc docx odt rtf pages epub");
assign("spreadsheet", "xls xlsx xlsm ods csv tsv numbers");
assign("presentation", "ppt pptx odp key");
assign(
  "code",
  "c h cpp hpp cc hh cxx cs java kt kts rs go py rb php js jsx mjs cjs ts tsx " +
    "swift scala el lisp scm ss clj cljs hs ml mli lua pl pm r dart vue svelte " +
    "css scss sass less html htm xml xsl sql vb m mm zig nim ex exs erl f90 asm s",
);
assign("script", "sh bash zsh fish ksh csh bat cmd ps1 psm1 awk sed");
assign("executable", "exe msi com appimage run bin out dll so dylib wasm");
assign(
  "config",
  "json jsonc json5 yaml yml toml ini conf cfg env lock properties plist " +
    "editorconfig gitignore gitattributes npmrc",
);
assign("text", "txt md markdown rst log org tex adoc nfo diff patch");
assign("font", "ttf otf woff woff2 ttc fon");

/** 拡張子の無い, 決まった名前 (小文字) のファイルの種類. */
const NAMES: Record<string, FileKind> = {
  makefile: "code",
  gnumakefile: "code",
  dockerfile: "config",
  readme: "text",
  license: "text",
  licence: "text",
  copying: "text",
  changelog: "text",
  authors: "text",
};

/**
 * 名前から, アイコンの種類を決めます. ディレクトリは `dir`, 分からないファイルは `file` です.
 * 拡張子は大文字と小文字を区別しません. `.gitignore` のような `.` で始まる名前は, `.` の後を拡張子とみなします.
 *
 * @param name - ファイルまたはディレクトリの名前.
 * @param isDir - ディレクトリの場合は true.
 * @returns アイコンの種類.
 */
export function fileKind(name: string, isDir: boolean): FileKind {
  if (isDir) {
    return "dir";
  }
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  const base = dot > 0 ? lower.slice(0, dot) : lower;
  return EXTENSIONS[ext] ?? NAMES[base] ?? "file";
}
