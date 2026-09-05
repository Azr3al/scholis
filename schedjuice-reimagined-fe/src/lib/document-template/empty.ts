import { defaultTextBlock } from "./insert";
import type { BlockDocument } from "./types";

export function emptyDocument(): BlockDocument {
  return {
    version: 1,
    page: { preset: "a4_portrait", width: 210, height: 297, unit: "mm" },
    blocks: [defaultTextBlock()],
  };
}

export function asBlockDocument(raw: unknown): BlockDocument {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyDocument();
  }
  const rec = raw as Partial<BlockDocument>;
  if (rec.version !== 1 || !rec.page || !Array.isArray(rec.blocks)) {
    return emptyDocument();
  }
  return {
    version: 1,
    page: {
      preset: rec.page.preset ?? "a4_portrait",
      width: Number(rec.page.width) || 210,
      height: Number(rec.page.height) || 297,
      unit: "mm",
    },
    blocks: rec.blocks,
  };
}

export type EnsureTextBlockResult = {
  document: BlockDocument;
  injected: boolean;
};

export function ensureTextBlock(doc: BlockDocument): EnsureTextBlockResult {
  if (doc.blocks.length > 0) return { document: doc, injected: false };
  return { document: { ...doc, blocks: [defaultTextBlock()] }, injected: true };
}
