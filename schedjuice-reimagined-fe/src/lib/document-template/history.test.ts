import { describe, expect, it } from "vitest";
import { emptyDocument, ensureTextBlock } from "./empty";
import {
  HISTORY_CAP,
  commitChange,
  emptyHistory,
  redo,
  undo,
} from "./history";
import { defaultTextBlock, removeBlock } from "./insert";

describe("document history", () => {
  it("undo after deleting the last block restores that block, not the injected empty one", () => {
    const original = {
      ...emptyDocument(),
      blocks: [{ ...defaultTextBlock(), id: "keep-me", text: "Hello" }],
    };
    const afterDelete = ensureTextBlock(removeBlock(original, "keep-me")).document;
    const history = commitChange(emptyHistory(), original);
    const undone = undo(history, afterDelete);
    expect(undone).not.toBeNull();
    expect(undone!.document.blocks).toHaveLength(1);
    expect(undone!.document.blocks[0]).toMatchObject({ id: "keep-me", text: "Hello" });
  });

  it("undo at the bottom is a no-op", () => {
    expect(undo(emptyHistory(), emptyDocument())).toBeNull();
  });

  it("caps past at 50", () => {
    let history = emptyHistory();
    let current = emptyDocument();
    for (let i = 0; i < HISTORY_CAP + 5; i += 1) {
      history = commitChange(history, current);
      current = { ...current, blocks: [{ ...defaultTextBlock(), text: String(i) }] };
    }
    expect(history.past).toHaveLength(HISTORY_CAP);
  });

  it("redo after undo restores the post-delete ensured document", () => {
    const original = {
      ...emptyDocument(),
      blocks: [{ ...defaultTextBlock(), id: "keep-me", text: "Hello" }],
    };
    const afterDelete = ensureTextBlock(removeBlock(original, "keep-me")).document;
    const undone = undo(commitChange(emptyHistory(), original), afterDelete);
    const redone = redo(undone!.history, undone!.document);
    expect(redone).not.toBeNull();
    expect(redone!.document.blocks[0]?.id).toBe(afterDelete.blocks[0]?.id);
  });
});
