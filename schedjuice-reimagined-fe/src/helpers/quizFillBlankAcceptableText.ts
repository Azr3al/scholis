import type { JSONContent } from "@tiptap/core";
import { convertToEditorDoc } from "@/helpers/convertToEditorDoc";

function plainTextFromDocNodes(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (!node.content?.length) return "";
  return node.content.map((c) => plainTextFromDocNodes(c)).join("");
}

/**
 * Acceptable-answer `body` from the API may be plain text or legacy TipTap JSON.
 * Students answer in plain text; editors and review UIs use this string.
 */
export function acceptableAnswerToPlainText(body: unknown): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  const doc = convertToEditorDoc(body);
  return plainTextFromDocNodes(doc);
}
