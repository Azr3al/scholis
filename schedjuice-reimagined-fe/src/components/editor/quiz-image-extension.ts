import Image from "@tiptap/extension-image";

/**
 * Quiz inline images: `attachmentId` persisted; `pending` / `uploadId` only in the editor until upload completes.
 */
export const QuizImage = Image.extend({
  name: "image",

  addAttributes() {
    return {
      ...this.parent?.(),
      attachmentId: {
        default: null as number | null,
        parseHTML: (element) => {
          const v = element.getAttribute("data-attachment-id");
          if (v == null || v === "") return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        },
        renderHTML: (attributes) => {
          if (attributes.attachmentId == null) return {};
          return { "data-attachment-id": String(attributes.attachmentId) };
        },
      },
      pending: {
        default: false,
      },
      uploadId: {
        default: null as string | null,
      },
      byteSize: {
        default: null as number | null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      /** Server URL after staging upload; kept out of saved HTML (compose uses blob preview). */
      attachmentUrl: {
        default: null as string | null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },
});
