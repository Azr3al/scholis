import type { ChatMessage } from "@/types/chat";

/** True when API / cache marks the row soft-deleted (snake_case or legacy `is_deleted`). */
function isDeletedAtValue(
  raw: string | null | undefined
): boolean {
  if (raw == null) return false;
  if (typeof raw === "string" && raw.trim() === "") return false;
  return true;
}

type ChatMessageWithDeleteFlag = ChatMessage & { is_deleted?: boolean };

export function isChatMessageRowDeleted(msg: ChatMessageWithDeleteFlag): boolean {
  if (msg.is_deleted === true) return true;
  return isDeletedAtValue(msg.deleted_at);
}

export function isReplyPreviewDeleted(preview: {
  deleted_at?: string | null;
}): boolean {
  return isDeletedAtValue(preview.deleted_at);
}
