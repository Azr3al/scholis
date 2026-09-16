import { getAttachmentUrl } from "@/lib/attachment/attachment-url";
import type { LeaveRequestAttachment } from "@/sdk/_types/leave-requests";
import type { ChatAttachmentRef } from "@/types/chat";

export function leaveAttachmentToChatRef(
  attachment: LeaveRequestAttachment,
): ChatAttachmentRef {
  const download_url = getAttachmentUrl({
    filename: attachment.filename,
    file_type: attachment.file_type,
    public_data: attachment.public_data,
    data: attachment.data,
    is_image: attachment.is_image,
  });

  return {
    attachment_id: attachment.id,
    name: attachment.filename?.trim() ?? "",
    mime_type: attachment.file_type?.trim() || "application/octet-stream",
    size_bytes: attachment.size ?? 0,
    download_url: download_url || undefined,
  };
}

/** Prefer Juice Box presigned URLs; keep expanded `public_data` when resolve omits a URL. */
export function mergeLeaveAttachmentDownloadUrl(
  baseRef: ChatAttachmentRef,
  resolvedRefs: ChatAttachmentRef[] | undefined,
): ChatAttachmentRef {
  const resolved = resolvedRefs?.find(
    (ref) => ref.attachment_id === baseRef.attachment_id,
  );
  if (!resolved) {
    return baseRef;
  }

  return {
    ...baseRef,
    name: baseRef.name || resolved.name,
    mime_type: baseRef.mime_type || resolved.mime_type,
    size_bytes: baseRef.size_bytes || resolved.size_bytes,
    download_url: resolved.download_url || baseRef.download_url,
  };
}
