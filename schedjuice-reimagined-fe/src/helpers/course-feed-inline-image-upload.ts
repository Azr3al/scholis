import type { Editor } from "@tiptap/core";

import { uploadCourseFeedInlineImage } from "@/app/client-api/course-feed-attachments";
import { compressImageForTeams } from "@/helpers/compress-image-for-teams";
import type { InlineImageNode } from "@/helpers/teams-inline-image-budget";

export function replaceInlineImageAttrsByUploadId(
  editor: Editor,
  uploadId: string,
  nextAttrs: Record<string, unknown>,
) {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      let changed = false;
      state.doc.descendants((node, pos) => {
        if (node.type.name !== "image") return;
        if (node.attrs.uploadId !== uploadId) return;
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          ...nextAttrs,
        });
        changed = true;
      });
      return changed;
    })
    .run();
}

export function removeInlineImageByUploadId(editor: Editor, uploadId: string) {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const ranges: { from: number; to: number }[] = [];
      state.doc.descendants((node, pos) => {
        if (node.type.name !== "image") return;
        if (node.attrs.uploadId === uploadId) {
          ranges.push({ from: pos, to: pos + node.nodeSize });
        }
      });
      ranges
        .sort((a, b) => b.from - a.from)
        .forEach(({ from, to }) => tr.delete(from, to));
      return ranges.length > 0;
    })
    .run();
}

export function collectInlineImageNodes(editor: Editor | null): InlineImageNode[] {
  if (!editor) return [];
  const nodes: InlineImageNode[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "image") return;
    nodes.push({
      attachmentId:
        typeof node.attrs.attachmentId === "number"
          ? node.attrs.attachmentId
          : node.attrs.attachmentId != null
            ? Number(node.attrs.attachmentId)
            : null,
      byteSize:
        typeof node.attrs.byteSize === "number"
          ? node.attrs.byteSize
          : node.attrs.byteSize != null
            ? Number(node.attrs.byteSize)
            : null,
    });
  });
  return nodes;
}

export function countPendingInlineImages(editor: Editor | null): number {
  if (!editor) return 0;
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "image" && node.attrs.pending === true) {
      count += 1;
    }
  });
  return count;
}

export async function insertCourseFeedInlineImage(
  editor: Editor,
  file: File,
  opts: {
    courseId: number;
    uploadId: string;
    onPendingDelta: (delta: number) => void;
  },
): Promise<void> {
  const preview = URL.createObjectURL(file);
  opts.onPendingDelta(1);
  editor
    .chain()
    .focus()
    .insertContent({
      type: "image",
      attrs: {
        src: preview,
        attachmentId: null,
        byteSize: null,
        pending: true,
        uploadId: opts.uploadId,
      },
    })
    .run();

  try {
    const compressed = await compressImageForTeams(file);
    const uploaded = await uploadCourseFeedInlineImage(opts.courseId, compressed);
    replaceInlineImageAttrsByUploadId(editor, opts.uploadId, {
      attachmentId: uploaded.id,
      attachmentUrl: uploaded.url,
      byteSize: uploaded.byteSize,
      pending: false,
      uploadId: null,
    });
  } catch {
    removeInlineImageByUploadId(editor, opts.uploadId);
    URL.revokeObjectURL(preview);
    throw new Error("Image upload failed");
  } finally {
    opts.onPendingDelta(-1);
  }
}

export function isClipboardImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
}

/** Persisted HTML needs server URLs; the editor keeps blob previews to avoid reload flicker. */
export function serializeCourseFeedEditorHtml(editor: Editor): string {
  const html = editor.getHTML();
  const urlByAttachmentId = new Map<number, string>();
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "image") return;
    const id =
      typeof node.attrs.attachmentId === "number"
        ? node.attrs.attachmentId
        : node.attrs.attachmentId != null
          ? Number(node.attrs.attachmentId)
          : null;
    const url =
      typeof node.attrs.attachmentUrl === "string"
        ? node.attrs.attachmentUrl
        : null;
    if (id != null && url) urlByAttachmentId.set(id, url);
  });
  if (urlByAttachmentId.size === 0) return html;

  return html.replace(/<img\b([^>]*?)>/gi, (match, attrs: string) => {
    const idMatch = attrs.match(/data-attachment-id=["'](\d+)["']/i);
    if (!idMatch) return match;
    const serverUrl = urlByAttachmentId.get(Number(idMatch[1]));
    if (!serverUrl) return match;
    if (/src=["'][^"']*["']/i.test(attrs)) {
      return `<img${attrs.replace(/src=["'][^"']*["']/i, `src="${serverUrl}"`)}>`;
    }
    return `<img src="${serverUrl}"${attrs}>`;
  });
}
