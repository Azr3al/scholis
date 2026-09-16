import type { JSONContent } from "@tiptap/core";

export const convertToEditorDoc = (value: any): JSONContent => {
  if (!value) return { type: "doc", content: [{ type: "paragraph" }] };
  if (typeof value === "string") {
    const t = value.trim();
    if (t.startsWith("{")) {
      try {
        const parsed = JSON.parse(t) as JSONContent;
        if (parsed?.type === "doc") return parsed;
      } catch {
        /* plain text or invalid JSON */
      }
    }
    return {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: value }] },
      ],
    };
  }
  if (value?.type === "doc") return value as JSONContent;
  return { type: "doc", content: [{ type: "paragraph" }] };
};
