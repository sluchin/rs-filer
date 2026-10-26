import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FileIcon from "@/features/explorer/components/FileIcon";
import type { FileKind } from "@/utils/fileKind";

const KINDS: FileKind[] = [
  "dir",
  "parent",
  "image",
  "video",
  "audio",
  "archive",
  "pdf",
  "document",
  "spreadsheet",
  "presentation",
  "code",
  "script",
  "executable",
  "config",
  "text",
  "font",
  "file",
];

describe("FileIcon", () => {
  it.each(KINDS)(
    "正常系: %s のアイコンを, 種類を data-icon に付けて描くこと",
    (kind) => {
      const { container } = render(<FileIcon kind={kind} />);
      const svg = container.querySelector("svg.file-icon");
      expect(svg).toHaveAttribute("data-icon", kind);
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg?.childElementCount).toBeGreaterThan(0);
    },
  );

  it("正常系: 種類ごとに絵が違うこと", () => {
    const drawings = KINDS.map((kind) =>
      render(<FileIcon kind={kind} />).container.innerHTML.replace(
        /data-icon="[^"]*"/,
        "",
      ),
    );
    expect(new Set(drawings).size).toBe(KINDS.length);
  });
});
