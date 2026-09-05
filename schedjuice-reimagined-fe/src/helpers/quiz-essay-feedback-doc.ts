/** Minimal TipTap JSON aligned with backend `AttemptAnswer.feedback` defaults. */

export const emptyQuizV3TiptapDoc = (): Record<string, unknown> => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});

function isNonEmptyTextDoc(doc: unknown): doc is Record<string, unknown> {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as Record<string, unknown>;
  if (d.type !== "doc" || !Array.isArray(d.content)) return false;
  for (const block of d.content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type !== "paragraph" || !Array.isArray(b.content)) continue;
    for (const inline of b.content) {
      if (!inline || typeof inline !== "object") continue;
      const n = inline as Record<string, unknown>;
      if (n.type === "text" && String(n.text ?? "").trim()) return true;
    }
  }
  return false;
}

/**
 * Coerces plain text to a single-paragraph TipTap doc for essay feedback PATCH bodies.
 */
export function plainTextToFeedbackDoc(text: string): Record<string, unknown> {
  const t = text.trim();
  if (!t) return emptyQuizV3TiptapDoc();
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: t }],
      },
    ],
  };
}

/** Best-effort plain text for preview inputs (empty paragraph doc → ""). */
export function feedbackDocToPlainText(doc: unknown): string {
  if (!isNonEmptyTextDoc(doc)) return "";
  const d = doc as Record<string, unknown>;
  const parts: string[] = [];
  for (const block of d.content as unknown[]) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type !== "paragraph" || !Array.isArray(b.content)) continue;
    for (const inline of b.content) {
      if (!inline || typeof inline !== "object") continue;
      const n = inline as Record<string, unknown>;
      if (n.type === "text") parts.push(String(n.text ?? ""));
    }
  }
  return parts.join("").trim();
}
