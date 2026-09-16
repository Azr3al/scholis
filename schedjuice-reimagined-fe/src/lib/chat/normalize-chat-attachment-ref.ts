import { getAttachmentUrl } from "@/lib/attachment/attachment-url";
import type { ChatAttachmentRef } from "@/types/chat";

type LooseChatAttachmentRef = ChatAttachmentRef & {
  downloadUrl?: string;
  public_data?: unknown;
  data?: unknown;
};

/** Normalize API / timeline attachment shapes onto ChatAttachmentRef. */
export function normalizeChatAttachmentRef(ref: LooseChatAttachmentRef): ChatAttachmentRef {
  const download_url =
    ref.download_url?.trim() ||
    (typeof ref.downloadUrl === "string" ? ref.downloadUrl.trim() : "") ||
    getAttachmentUrl({
      filename: ref.name,
      file_type: ref.mime_type,
      public_data: ref.public_data,
      data: ref.data,
      download_url: ref.download_url,
      downloadUrl: ref.downloadUrl,
    }) ||
    undefined;

  return {
    attachment_id: ref.attachment_id,
    name: ref.name?.trim() ?? "",
    mime_type: ref.mime_type?.trim() || "application/octet-stream",
    size_bytes: typeof ref.size_bytes === "number" ? ref.size_bytes : 0,
    download_url,
  };
}

export function chatAttachmentRefNeedsResolve(ref: ChatAttachmentRef): boolean {
  return Number.isFinite(ref.attachment_id) && ref.attachment_id > 0 && !ref.download_url;
}
