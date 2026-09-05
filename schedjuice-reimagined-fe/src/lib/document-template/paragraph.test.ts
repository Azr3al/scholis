import { describe, expect, it } from "vitest";
import { defaultTextBlock } from "./insert";
import { matchParagraphPreset, stampParagraphPreset } from "./paragraph";

describe("stampParagraphPreset", () => {
  it("Heading 1 stamps 22pt bold and does not write style", () => {
    const next = stampParagraphPreset(defaultTextBlock(), "heading1");
    expect(next.fontSize).toBe(22);
    expect(next.bold).toBe(true);
    expect(next.italic).toBe(false);
    expect(next).not.toHaveProperty("style");
  });

  it("keeps an existing font family", () => {
    const block = { ...defaultTextBlock(), fontFamily: "Georgia", italic: true };
    const next = stampParagraphPreset(block, "title");
    expect(next.fontFamily).toBe("Georgia");
    expect(next.fontSize).toBe(28);
    expect(next.bold).toBe(true);
    expect(next.italic).toBe(false);
  });

  it("uses Noto Sans when fontFamily is unset", () => {
    const block = defaultTextBlock();
    delete block.fontFamily;
    const next = stampParagraphPreset(block, "body");
    expect(next.fontFamily).toBe("Noto Sans");
  });
});

describe("matchParagraphPreset", () => {
  it("treats unmatched size as Body without changing the block", () => {
    const block = { ...defaultTextBlock(), fontSize: 18, bold: false };
    expect(matchParagraphPreset(block)).toBe("body");
  });

  it("matches Title by 28pt + bold even if italic is on", () => {
    const block = { ...defaultTextBlock(), fontSize: 28, bold: true, italic: true };
    expect(matchParagraphPreset(block)).toBe("title");
  });
});
