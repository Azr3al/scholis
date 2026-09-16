const ALLOWED_MIME_TYPES: string[] = [
  "image/*",
  "video/*",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
];

/** Mirrors `isAllowedFileType` in `@/helpers/file` without that module's side-effect imports. */
function isAllowedFileType(file: File): boolean {
  const type = file.type || "";
  if (!type) {
    const name = (file.name || "").toLowerCase();
    return (
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".gif") ||
      name.endsWith(".webp") ||
      name.endsWith(".mp4") ||
      name.endsWith(".mov") ||
      name.endsWith(".mkv") ||
      name.endsWith(".avi") ||
      name.endsWith(".webm") ||
      name.endsWith(".pdf") ||
      name.endsWith(".doc") ||
      name.endsWith(".docx") ||
      name.endsWith(".xls") ||
      name.endsWith(".xlsx") ||
      name.endsWith(".ppt") ||
      name.endsWith(".pptx") ||
      name.endsWith(".csv")
    );
  }
  if (type.startsWith("image/")) return true;
  if (type.startsWith("video/")) return true;
  return ALLOWED_MIME_TYPES.includes(type);
}

export function collectClipboardFiles(
  clipboardData: DataTransfer | null | undefined,
): File[] {
  if (!clipboardData) return [];

  const filesList = clipboardData.files;
  if (filesList && filesList.length > 0) {
    const result: File[] = [];
    for (let i = 0; i < filesList.length; i++) {
      const f = filesList.item(i);
      if (f && f.size > 0) result.push(f);
    }
    return result;
  }

  const seen = new Map<string, File>();
  const items = clipboardData.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it?.kind === "file") {
        const f = it.getAsFile();
        if (f && f.size > 0) seen.set(`${f.name}-${f.size}`, f);
      }
    }
  }

  return Array.from(seen.values());
}

export type FilterFilesForAttachmentsOptions = {
  isImageOnly: boolean;
  /** How many more files may be added. Defaults to Infinity. */
  remainingSlots?: number;
};

export type FilterFilesForAttachmentsResult = {
  accepted: File[];
  rejected: { file: File; reason: "type" }[];
  skippedCount: number;
};

function isAcceptableAttachmentFile(
  file: File,
  isImageOnly: boolean,
): boolean {
  if (isImageOnly) {
    if (file.type?.startsWith("image/")) return true;
    const name = (file.name || "").toLowerCase();
    return (
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".gif") ||
      name.endsWith(".webp")
    );
  }
  return isAllowedFileType(file);
}

export function filterFilesForAttachments(
  files: File[],
  options: FilterFilesForAttachmentsOptions,
): FilterFilesForAttachmentsResult {
  const remainingSlots =
    options.remainingSlots === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, options.remainingSlots);

  const rejected: { file: File; reason: "type" }[] = [];
  const typedOk: File[] = [];

  for (const file of files) {
    if (isAcceptableAttachmentFile(file, options.isImageOnly)) {
      typedOk.push(file);
    } else {
      rejected.push({ file, reason: "type" });
    }
  }

  if (remainingSlots <= 0) {
    return {
      accepted: [],
      rejected,
      skippedCount: typedOk.length,
    };
  }

  const accepted = typedOk.slice(0, remainingSlots);
  return {
    accepted,
    rejected,
    skippedCount: typedOk.length - accepted.length,
  };
}
