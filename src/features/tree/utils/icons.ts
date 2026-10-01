/**
 * ファイル・ディレクトリのアイコンを返す.
 *
 * @param name - ファイル・ディレクトリの名前.
 * @param isDir - ディレクトリの場合は true.
 * @returns 表示するアイコン.
 */
export function getFileIcon(name: string, isDir: boolean): string {
  if (isDir) {
    return "📁";
  }

  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  const iconMap: Record<string, string> = {
    // テキスト
    txt: "📄",
    md: "📝",
    json: "⚙️",
    xml: "⚙️",
    yaml: "⚙️",
    yml: "⚙️",
    toml: "⚙️",
    csv: "📊",

    // 画像
    png: "🖼️",
    jpg: "🖼️",
    jpeg: "🖼️",
    gif: "🖼️",
    bmp: "🖼️",
    svg: "🖼️",
    webp: "🖼️",
    ico: "🖼️",

    // 動画
    mp4: "🎬",
    avi: "🎬",
    mkv: "🎬",
    mov: "🎬",
    flv: "🎬",
    wmv: "🎬",

    // 音声
    mp3: "🎵",
    wav: "🎵",
    flac: "🎵",
    aac: "🎵",
    m4a: "🎵",
    ogg: "🎵",

    // アーカイブ
    zip: "📦",
    rar: "📦",
    "7z": "📦",
    tar: "📦",
    gz: "📦",
    bz2: "📦",

    // コード
    js: "⚡",
    ts: "⚡",
    py: "🐍",
    java: "☕",
    cpp: "➕",
    c: "🔤",
    go: "🐹",
    rs: "🦀",
    rb: "💎",
    php: "🐘",
    swift: "🍎",
    kt: "🎯",

    // ドキュメント
    pdf: "📕",
    doc: "📘",
    docx: "📘",
    xls: "📗",
    xlsx: "📗",
    ppt: "📙",
    pptx: "📙",

    // その他
    exe: "⚙️",
    app: "⚙️",
    dmg: "⚙️",
    sh: "🔧",
    bat: "🔧",
  };

  return iconMap[ext] ?? "📄";
}
