export const FILE_TYPE_PRESETS = [
  { value: "image", label: "Images only" },
  { value: "document", label: "Documents" },
  { value: "image_document", label: "Images & documents" },
  { value: "any", label: "Any allowed type" },
] as const;

export type FileTypePreset = (typeof FILE_TYPE_PRESETS)[number]["value"];

export const PRESET_EXTENSIONS: Record<FileTypePreset, string[]> = {
  image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"],
  document: [".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".csv"],
  image_document: [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".heic",
    ".heif",
    ".pdf",
    ".docx",
    ".xlsx",
    ".pptx",
    ".txt",
    ".csv",
  ],
  any: [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".heic",
    ".heif",
    ".pdf",
    ".docx",
    ".xlsx",
    ".pptx",
    ".txt",
    ".csv",
    ".mp4",
    ".mp3",
    ".m4a",
    ".zip",
  ],
};

export type AttachmentFieldRules = {
  max_file_size_mb: number;
  max_files: number;
  file_type_preset: FileTypePreset;
  allowed_extensions: string[];
  allow_camera_capture: boolean;
};

export const DEFAULT_ATTACHMENT_FIELD_RULES: AttachmentFieldRules = {
  max_file_size_mb: 10,
  max_files: 1,
  file_type_preset: "image_document",
  allowed_extensions: [],
  allow_camera_capture: false,
};

/** Mirrors backend MIME_TO_EXTENSIONS in app_custom_fields/attachment_rules.py */
export const EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".zip": "application/zip",
};

/** Value for `<input type="file" accept="…">` from allowed extensions. */
export function buildAttachmentFileInputAccept(extensions: string[]): string {
  const mimes = new Set<string>();
  for (const ext of extensions) {
    const mime = EXTENSION_TO_MIME[ext];
    if (mime) mimes.add(mime);
  }
  return extensions.concat(Array.from(mimes)).join(",");
}

/** react-dropzone accept map from allowed extensions. */
export function buildAttachmentDropzoneAccept(
  extensions: string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const ext of extensions) {
    const mime = EXTENSION_TO_MIME[ext];
    if (!mime) continue;
    if (!out[mime]) out[mime] = [];
    if (!out[mime].includes(ext)) out[mime].push(ext);
  }
  return out;
}

export function attachmentRulesFromValidationRules(
  rules: Record<string, unknown> | null | undefined,
): AttachmentFieldRules {
  const preset = (rules?.file_type_preset as FileTypePreset) || "image_document";
  return {
    max_file_size_mb:
      typeof rules?.max_file_size_mb === "number" ? rules.max_file_size_mb : 10,
    max_files: typeof rules?.max_files === "number" ? rules.max_files : 1,
    file_type_preset: FILE_TYPE_PRESETS.some((p) => p.value === preset)
      ? preset
      : "image_document",
    allowed_extensions: Array.isArray(rules?.allowed_extensions)
      ? (rules.allowed_extensions as string[])
      : [],
    allow_camera_capture: Boolean(rules?.allow_camera_capture),
  };
}
