import { isRasterImageFilename } from "@/lib/announcement/is-raster-image-filename";
import type { attachmentType } from "@/types/attachment";

export type AttachmentLike =
  | attachmentType
  | {
      id?: number;
      filename?: string;
      name?: string;
      file?: string;
      data?: unknown;
      public_data?: unknown;
      download_url?: unknown;
      downloadUrl?: unknown;
      url?: string;
      is_image?: boolean;
      file_type?: string;
      mime_type?: string;
    };

function readHttpUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.toLowerCase().startsWith("http") ? trimmed : "";
}

type AttachmentUrlSource = {
  download_url?: unknown;
  downloadUrl?: unknown;
  public_data?: unknown;
  data?: unknown;
  url?: string;
  file?: string;
};

export function getAttachmentUrl(att: AttachmentLike): string {
  const source = att as AttachmentUrlSource;
  const url =
    readHttpUrl(source.download_url) ||
    readHttpUrl(source.downloadUrl) ||
    readHttpUrl(source.public_data) ||
    readHttpUrl(source.data) ||
    readHttpUrl(source.url) ||
    (typeof source.file === "string" ? source.file : "");
  return url;
}

export function isAttachmentImage(att: AttachmentLike): boolean {
  const loose = att as AttachmentLike & { name?: string };
  const filename = loose.filename || loose.name || "";
  if (att.is_image) return true;
  if (isRasterImageFilename(filename)) return true;
  const mime = att.file_type || "";
  return mime.startsWith("image/");
}
