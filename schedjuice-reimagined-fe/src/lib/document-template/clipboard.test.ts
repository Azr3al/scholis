import { describe, expect, it } from "vitest";
import { pasteBlock } from "./clipboard";
import { emptyDocument } from "./empty";
import {
  defaultTextBlock,
  insertBlock,
  insertColumnChild,
} from "./insert";

describe("pasteBlock", () => {
  it("pastes text as the next sibling inside a column", () => {
    let doc = insertBlock(emptyDocument(), "columns");
    const columns = doc.blocks.find((block) => block.type === "columns")!;
    const child = defaultTextBlock();
    doc = insertColumnChild(doc, columns.id, 0, { ...child, id: "c1", text: "A" });
    const next = pasteBlock(doc, "c1", { ...defaultTextBlock(), text: "B" });
    const cols = next.blocks.find((block) => block.type === "columns");
    expect(cols?.type).toBe("columns");
    if (cols?.type !== "columns") return;
    expect(cols.columns[0]).toHaveLength(2);
    expect(cols.columns[0][1]?.type).toBe("text");
    expect(cols.columns[0][1]?.id).not.toBe("c1");
  });

  it("pastes a columns block at page level even when a column child is selected", () => {
    let doc = insertBlock(emptyDocument(), "columns");
    const columns = doc.blocks.find((block) => block.type === "columns")!;
    doc = insertColumnChild(doc, columns.id, 0, { ...defaultTextBlock(), id: "c1" });
    const copied = insertBlock(emptyDocument(), "columns").blocks.find(
      (block) => block.type === "columns",
    )!;
    const next = pasteBlock(doc, "c1", copied);
    expect(next.blocks.filter((block) => block.type === "columns")).toHaveLength(2);
    expect(next.blocks.some((block) => block.id === copied.id)).toBe(false);
  });
});
