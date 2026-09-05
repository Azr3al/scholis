import { describe, expect, it } from "vitest";
import { asBlockDocument, emptyDocument, ensureTextBlock } from "./empty";
import { defaultImageBlock } from "./insert";

describe("ensureTextBlock", () => {
  it("injects one empty text block into an empty page", () => {
    const { document, injected } = ensureTextBlock({
      version: 1,
      page: { preset: "a4_portrait", width: 210, height: 297, unit: "mm" },
      blocks: [],
    });
    expect(injected).toBe(true);
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]).toMatchObject({
      type: "text",
      text: "",
      fontSize: 12,
      bold: false,
      italic: false,
    });
  });

  it("leaves an image-only document unchanged", () => {
    const image = defaultImageBlock();
    const source = {
      version: 1 as const,
      page: {
        preset: "a4_portrait" as const,
        width: 210,
        height: 297,
        unit: "mm" as const,
      },
      blocks: [image],
    };
    const { document, injected } = ensureTextBlock(source);
    expect(injected).toBe(false);
    expect(document.blocks).toEqual([image]);
  });
});

describe("asBlockDocument", () => {
  it("does not inject while parsing an empty saved draft", () => {
    const parsed = asBlockDocument({
      version: 1,
      page: { preset: "a4_portrait", width: 210, height: 297, unit: "mm" },
      blocks: [],
    });
    expect(parsed.blocks).toEqual([]);
  });
});

describe("emptyDocument", () => {
  it("starts with one empty text block", () => {
    const doc = emptyDocument();
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]?.type).toBe("text");
  });
});
