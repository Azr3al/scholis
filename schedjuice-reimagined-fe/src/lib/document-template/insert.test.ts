import { describe, expect, it } from "vitest";
import { emptyDocument, ensureTextBlock } from "./empty";
import {
  defaultTextBlock,
  insertBlock,
  insertColumnChild,
  insertVariable,
  removeBlock,
} from "./insert";
import { INLINE_VARIABLE_KEYS } from "./tokens";

describe("insertBlock", () => {
  it("inserts grades_table without student rows", () => {
    const next = insertBlock(emptyDocument(), "grades_table");
    const table = next.blocks.at(-1);
    expect(table?.type).toBe("grades_table");
    expect(table && "rows" in table ? table.rows : undefined).toBeUndefined();
    expect(table?.type === "grades_table" && table.columns.length).toBeGreaterThan(
      0,
    );
  });
});

describe("insertVariable", () => {
  it("insertVariable uses locked keys only", () => {
    expect(INLINE_VARIABLE_KEYS.has("student_name")).toBe(true);
    expect(INLINE_VARIABLE_KEYS.has("award_title")).toBe(false);
    const allowed = insertVariable("Hi ", 3, "student_name");
    expect(allowed.text).toBe("Hi {{student_name}}");
    const rejected = insertVariable("Hi ", 3, "award_title");
    expect(rejected.text).toBe("Hi ");
  });
});

describe("removeBlock + ensureTextBlock", () => {
  it("restores one text block after deleting the last top-level block", () => {
    const only = {
      version: 1 as const,
      page: {
        preset: "a4_portrait" as const,
        width: 210,
        height: 297,
        unit: "mm" as const,
      },
      blocks: [{ ...defaultTextBlock(), id: "only" }],
    };
    const { document, injected } = ensureTextBlock(removeBlock(only, "only"));
    expect(injected).toBe(true);
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]?.type).toBe("text");
    expect(document.blocks[0]?.id).not.toBe("only");
  });

  it("does not insert page text when a column child is deleted", () => {
    const page = emptyDocument();
    const withColumns = insertBlock(page, "columns");
    const columnsId = withColumns.blocks.find((block) => block.type === "columns")?.id;
    const child = { ...defaultTextBlock(), id: "col-child" };
    const withChild = insertColumnChild(withColumns, columnsId!, 0, child);
    const { document, injected } = ensureTextBlock(
      removeBlock(withChild, "col-child"),
    );
    expect(injected).toBe(false);
    expect(document.blocks.some((block) => block.type === "columns")).toBe(true);
  });
});
