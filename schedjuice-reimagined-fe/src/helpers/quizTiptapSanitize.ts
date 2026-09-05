import type { JSONContent } from "@tiptap/core";

/**
 * Persist only stable quiz image attrs (attachment id). Drops preview URLs and upload state.
 */
export function sanitizeQuizTiptapDoc(doc: unknown): JSONContent {
  const walk = (node: unknown): unknown => {
    if (node == null || typeof node !== "object") return node;
    const n = node as JSONContent & { content?: JSONContent[] };
    if (n.type === "quizFillBlank" && n.attrs && typeof n.attrs === "object") {
      const a = n.attrs as Record<string, unknown>;
      const blankId = a.blankId;
      const nextAttrs: Record<string, unknown> = {};
      if (typeof blankId === "string" && blankId) nextAttrs.blankId = blankId;
      return { ...n, attrs: nextAttrs };
    }
    if (n.type === "image" && n.attrs && typeof n.attrs === "object") {
      const a = n.attrs as Record<string, unknown>;
      const attachmentId = a.attachmentId;
      const nextAttrs: Record<string, unknown> = {};
      if (attachmentId != null) nextAttrs.attachmentId = attachmentId;
      if (typeof a.alt === "string") nextAttrs.alt = a.alt;
      if (typeof a.title === "string") nextAttrs.title = a.title;
      if (typeof a.width === "number") nextAttrs.width = a.width;
      if (typeof a.height === "number") nextAttrs.height = a.height;
      return { ...n, attrs: nextAttrs };
    }
    if (Array.isArray(n.content)) {
      return { ...n, content: n.content.map((c) => walk(c)) as JSONContent[] };
    }
    return n;
  };
  return walk(doc) as JSONContent;
}
