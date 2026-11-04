import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Modal from "@/components/Modal";

describe("Modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常系: ダイアログの文字色が黒になる", () => {
    render(
      <Modal title="コピー中" onClose={() => {}}>
        本文
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveStyle({ color: "#000000" });
  });
});
