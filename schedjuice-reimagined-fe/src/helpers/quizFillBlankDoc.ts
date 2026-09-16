import type { JSONContent } from "@tiptap/core";
import { convertToEditorDoc } from "@/helpers/convertToEditorDoc";
import {
  getFillBlankSlotBlankUuid,
  getFillBlankSlotsArray,
} from "@/helpers/quizFillBlankSlotMode";

/** Document order of `attrs.blankId` on `quizFillBlank` nodes. */
export function listQuizFillBlankIdsInOrder(doc: unknown): string[] {
  const base = convertToEditorDoc(doc);
  const out: string[] = [];
  const walk = (node: JSONContent): void => {
    if (node.type === "quizFillBlank") {
      const id = (node.attrs as { blankId?: string } | undefined)?.blankId;
      if (id) out.push(String(id));
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  };
  walk(base);
  return out;
}

/** Blank UUID order for the learner UI (API order, else document order). */
export function listFillBlankUuidsForTaker(question: {
  fill_blank_slots?: { blank_uuid?: string }[] | null;
  body?: unknown;
}): string[] {
  const fromSlots = getFillBlankSlotsArray(question)
    .map((s) => getFillBlankSlotBlankUuid(s))
    .filter((u): u is string => Boolean(u));
  if (fromSlots.length > 0) return fromSlots;
  return listQuizFillBlankIdsInOrder(question.body ?? {});
}

/**
 * Replace each `quizFillBlank` with a `quizFillBlankGap` node for read-only
 * HTML generation. The gap node carries the original `blankId`, so the rendered
 * `<span data-blank-id="…">` can be targeted (e.g. to highlight a specific
 * blank when the learner hovers/taps the matching answer panel icon).
 */
export function replaceFillBlankWithGapInDoc(doc: unknown): JSONContent {
  const base = convertToEditorDoc(doc);
  const walk = (node: JSONContent): JSONContent => {
    if (node.type === "quizFillBlank") {
      const blankId = (node.attrs as { blankId?: string } | undefined)?.blankId;
      return {
        type: "quizFillBlankGap",
        attrs: { blankId: blankId ?? null },
      };
    }
    if (Array.isArray(node.content)) {
      return { ...node, content: node.content.map(walk) };
    }
    return node;
  };
  return walk(base);
}
