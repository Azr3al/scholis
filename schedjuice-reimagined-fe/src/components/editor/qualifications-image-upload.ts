import type { Editor } from "@tiptap/core";
import { v4 as uuid } from "uuid";
import { fetchUserQualificationAttachmentPresignedUrl } from "@/helpers/attachment-api";
import { parseAttachmentUploadIds, uploadAttachments } from "@/helpers/file";

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

export function isAcceptedQualificationImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_BYTES;
}

export function replaceImageAttrsByUploadId(
  editor: Editor,
  uploadId: string,
  attrs: Record<string, unknown>,
) {
  const { state } = editor;
  let found = false;
  state.doc.descendants((node, pos) => {
    if (found || node.type.name !== "image") return;
    if (node.attrs.uploadId !== uploadId) return;
    found = true;
    editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
  });
}

export function removeImageByUploadId(editor: Editor, uploadId: string) {
  const { state } = editor;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "image" || node.attrs.uploadId !== uploadId) return;
    editor.view.dispatch(state.tr.delete(pos, pos + node.nodeSize));
  });
}

export async function insertQualificationImage(
  editor: Editor,
  file: File,
  userId: number,
  onPendingDelta: (delta: number) => void,
): Promise<void> {
  if (!isAcceptedQualificationImage(file)) {
    throw new Error("unsupported_image");
  }
  const uploadId = uuid();
  const preview = URL.createObjectURL(file);
  onPendingDelta(1);
  editor
    .chain()
    .focus()
    .insertContent({
      type: "image",
      attrs: { src: preview, attachmentId: null, pending: true, uploadId },
    })
    .run();

  try {
    const res = await uploadAttachments(
      [file],
      "user_qualifications",
      String(userId),
    );
    const attachmentId = parseAttachmentUploadIds(res)[0];
    if (attachmentId == null) throw new Error("missing_attachment_id");
    const presigned =
      (await fetchUserQualificationAttachmentPresignedUrl(attachmentId, userId)) ??
      preview;
    replaceImageAttrsByUploadId(editor, uploadId, {
      src: presigned,
      attachmentId,
      pending: false,
      uploadId: null,
    });
    URL.revokeObjectURL(preview);
  } catch {
    removeImageByUploadId(editor, uploadId);
    URL.revokeObjectURL(preview);
    throw new Error("upload_failed");
  } finally {
    onPendingDelta(-1);
  }
}
