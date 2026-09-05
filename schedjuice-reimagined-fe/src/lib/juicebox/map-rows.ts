import { isRasterImageFilename } from "@/lib/announcement/is-raster-image-filename";
import type {
  JuiceBoxAttachmentRow,
  JuiceBoxUploadResponse,
} from "@/lib/juicebox/types";
import type { ChatAttachmentRef } from "@/types/chat";
import type { attachmentType } from "@/types/attachment";

type LooseUploadRow = {
  id?: number;
  attachment_id?: number;
  filename?: string;
  name?: string;
  file_type?: string;
  mime_type?: string;
  size?: number | null;
  size_bytes?: number | null;
  download_url?: string | null;
  downloadUrl?: string | null;
  public_data?: string | null;
  data?: string | null;
  is_image?: boolean;
  table_name?: string;
};

function resolveDownloadUrl(row: LooseUploadRow): string | undefined {
  if (row.download_url) return row.download_url;
  if (row.downloadUrl) return row.downloadUrl;
  const publicData = row.public_data;
  if (
    typeof publicData === "string" &&
    publicData.trim().toLowerCase().startsWith("http")
  ) {
    return publicData.trim();
  }
  const data = row.data;
  if (typeof data === "string" && data.trim().toLowerCase().startsWith("http")) {
    return data.trim();
  }
  return undefined;
}

function mapRowToChatAttachmentRef(row: LooseUploadRow): ChatAttachmentRef | null {
  const attachmentId = row.attachment_id ?? row.id;
  if (attachmentId == null || !Number.isFinite(Number(attachmentId))) {
    return null;
  }
  const name = row.filename ?? row.name ?? "";
  const mimeType = row.file_type ?? row.mime_type ?? "application/octet-stream";
  const sizeBytes = row.size_bytes ?? row.size ?? 0;

  return {
    attachment_id: Number(attachmentId),
    name,
    mime_type: mimeType,
    size_bytes: typeof sizeBytes === "number" ? sizeBytes : 0,
    download_url: resolveDownloadUrl(row),
  };
}

function extractUploadRows(response: unknown): LooseUploadRow[] {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== "object") return [];

  const obj = response as Record<string, unknown>;
  if (Array.isArray(obj.attachments)) return obj.attachments as LooseUploadRow[];
  if (Array.isArray(obj.data)) return obj.data as LooseUploadRow[];

  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    const inner = obj.data as Record<string, unknown>;
    if (Array.isArray(inner.data)) return inner.data as LooseUploadRow[];
    if (Array.isArray(inner.attachments)) {
      return inner.attachments as LooseUploadRow[];
    }
  }

  return [];
}

export function mapJuiceBoxResponseToChatAttachmentRefs(
  response: JuiceBoxUploadResponse | JuiceBoxAttachmentRow[] | unknown
): ChatAttachmentRef[] {
  return extractUploadRows(response)
    .map(mapRowToChatAttachmentRef)
    .filter((ref): ref is ChatAttachmentRef => ref != null);
}

function mapJuiceBoxRowToAttachmentType(
  row: JuiceBoxAttachmentRow,
  tableName = ""
): attachmentType {
  const downloadUrl = resolveDownloadUrl(row) ?? "";
  const filename = row.filename ?? "";
  return {
    id: row.id,
    filename,
    is_image: row.is_image ?? isRasterImageFilename(filename),
    data: downloadUrl,
    public_data: downloadUrl,
    file_type: row.file_type ?? "application/octet-stream",
    table_name: row.table_name ?? tableName,
  };
}

export function mapJuiceBoxRowsToAttachmentTypes(
  rows: JuiceBoxAttachmentRow[] | undefined,
  tableName = ""
): attachmentType[] {
  if (!rows?.length) return [];
  return rows.map((row) => mapJuiceBoxRowToAttachmentType(row, tableName));
}
