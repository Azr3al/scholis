/** True when TipTap JSON is missing, not an object, or has no block content. */
export function isQuizV3TiptapDocEmpty(doc: unknown): boolean {
  if (doc == null) return true;
  if (typeof doc !== "object") return true;
  const content = (doc as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) return true;
  return false;
}
