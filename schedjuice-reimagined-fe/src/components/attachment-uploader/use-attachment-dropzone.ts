"use client";
import { useToast } from "@/components/primitives";

import { useCallback } from "react";
import { FileRejection, useDropzone } from "react-dropzone";

import {
  ALLOWED_ACCEPT_FOR_DROPZONE,
} from "@/helpers/file";
import { attachmentType } from "@/types/attachment";
import {
  collectClipboardFiles,
  filterFilesForAttachments,
} from "./attachment-dropzone-files";

export type AttachmentDropzoneBindings = {
  getRootProps: ReturnType<typeof useDropzone>["getRootProps"];
  getInputProps: ReturnType<typeof useDropzone>["getInputProps"];
  isDragActive: boolean;
  open: () => void;
  onPaste: (e: globalThis.ClipboardEvent) => void;
};

type UseAttachmentDropzoneParams = {
  attachments: (attachmentType | File)[];
  setAttachments: (attachments: (attachmentType | File)[]) => void;
  maxFiles?: number;
  isImageOnly?: boolean;
  accept?: Record<string, string[]>;
};

export function useAttachmentDropzone({
  attachments,
  setAttachments,
  maxFiles = 1,
  isImageOnly = false,
  accept,
}: UseAttachmentDropzoneParams): AttachmentDropzoneBindings {
  const toast = useToast();

  const addFiles = useCallback(
    (incoming: File[], pasteImageOnly = false) => {
      const remaining = Math.max(0, maxFiles - attachments.length);
      const filterImageOnly = pasteImageOnly || isImageOnly;
      const { accepted, rejected, skippedCount } = filterFilesForAttachments(
        incoming,
        { isImageOnly: filterImageOnly, remainingSlots: remaining },
      );

      for (const { file } of rejected) {
        if (pasteImageOnly && accepted.length === 0) {
          toast.add({
            type: "error",
            title: "Images only",
            description:
              "Paste only works with copied images (screenshots or photos).",
          });
          break;
        }
        toast.add({
          type: "error",
          title: "Unsupported file type",
          description: isImageOnly
            ? `${file.name} is not an image.`
            : `${file.name} is not allowed. Allowed: photos, videos, PDF, Microsoft Office files`,
        });
      }

      if (remaining <= 0 && incoming.length > 0) {
        toast.add({
          type: "error",
          title: "Limit reached",
          description: `You can only upload ${maxFiles} file${
            maxFiles > 1 ? "s" : ""
          }.`,
        });
        return;
      }

      if (accepted.length === 0) return;

      setAttachments([...attachments, ...accepted]);

      if (skippedCount > 0) {
        toast.add({
          title: "Some files skipped",
          description: `${skippedCount} file${
            skippedCount > 1 ? "s" : ""
          } were not added due to the ${maxFiles} file limit.`,
        });
      }
    },
    [attachments, isImageOnly, maxFiles, setAttachments, toast],
  );

  const onDrop = useCallback(
    (f: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        rejections.forEach((r) => {
          toast.add({
            title: "Unsupported file",
            description:
              r.errors[0]?.message || "This file cannot be uploaded.",
            type: "error",
          });
        });
      }
      addFiles(f || []);
    },
    [addFiles, toast],
  );

  const onPaste = useCallback(
    (e: globalThis.ClipboardEvent) => {
      const files = collectClipboardFiles(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      addFiles(files, true);
    },
    [addFiles],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    maxFiles: maxFiles || 2,
    accept:
      accept ??
      (isImageOnly
        ? { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"] }
        : ALLOWED_ACCEPT_FOR_DROPZONE),
    multiple: true,
    noClick: true,
    noKeyboard: true,
  });

  return { getRootProps, getInputProps, isDragActive, open, onPaste };
}

/** TipTap `handleDOMEvents.paste` — intercepts clipboard files and routes to attachment staging. */
export function createTipTapImagePasteHandler(
  onPaste: (e: globalThis.ClipboardEvent) => void,
) {
  return (_view: unknown, event: ClipboardEvent) => {
    const files = collectClipboardFiles(event.clipboardData);
    if (files.length === 0) return false;
    onPaste(event);
    return true;
  };
}
