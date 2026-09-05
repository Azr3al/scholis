import type { CustomFieldAttachmentSnapshot } from "@/lib/custom-fields/attachment-api";
import { isRasterImageFilename } from "@/lib/announcement/is-raster-image-filename";

export type AttachmentDetailRow = {
  id: number;
  filename: string;
  mime?: string;
};

export type DoneFile = {
  id: number;
  filename: string;
  size: number;
  mime?: string;
  downloadUrl?: string;
};

export function attachmentRowLabel(file: DoneFile): string {
  return file.filename || `File #${file.id}`;
}

export function isImageAttachment(file: DoneFile): boolean {
  return isImageDetailRow({
    id: file.id,
    filename: file.filename,
    mime: file.mime,
  });
}

export function parseAttachmentDetailRows(value: unknown): AttachmentDetailRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && "id" in item)
    .map((item) => {
      const row = item as CustomFieldAttachmentSnapshot;
      const id = Number(row.id);
      const filename = row.filename?.trim() ?? "";
      return {
        id,
        filename: filename || `File #${id}`,
        mime: row.mime ?? row.file_type,
      };
    })
    .filter((row) => Number.isFinite(row.id));
}

export function isImageDetailRow(row: AttachmentDetailRow): boolean {
  if (row.mime?.startsWith("image/")) return true;
  return isRasterImageFilename(row.filename);
}

export function toFormAttachmentValue(files: DoneFile[]) {
  return files.map((f) => ({
    id: f.id,
    filename: f.filename,
    size: f.size,
    ...(f.mime ? { mime: f.mime, file_type: f.mime } : {}),
    ...(f.downloadUrl ? { download_url: f.downloadUrl } : {}),
  }));
}

export function parseDoneFiles(value: unknown): DoneFile[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && "id" in item)
    .map((item) => {
      const row = item as CustomFieldAttachmentSnapshot;
      const id = Number(row.id);
      return {
        id,
        filename: row.filename ?? "",
        size: row.size ?? 0,
        mime: row.mime ?? row.file_type,
        downloadUrl: row.download_url,
      };
    })
    .filter((row) => Number.isFinite(row.id))
    .map((row) => ({
      ...row,
      filename: row.filename || attachmentRowLabel(row),
    }));
}

/** Preserve display metadata when form value only carries attachment ids. */
export function mergeDoneFilesFromValue(
  prev: DoneFile[],
  value: unknown,
): DoneFile[] {
  const parsed = parseDoneFiles(value);
  if (parsed.length === 0) return parsed;
  const prevById = new Map(prev.map((f) => [f.id, f]));
  return parsed.map((file) => {
    const existing = prevById.get(file.id);
    if (!existing) return file;
    return {
      ...file,
      filename:
        file.filename && !file.filename.startsWith("File #")
          ? file.filename
          : existing.filename || file.filename,
      size: file.size || existing.size,
      mime: file.mime ?? existing.mime,
      downloadUrl: file.downloadUrl ?? existing.downloadUrl,
    };
  });
}
