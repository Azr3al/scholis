import type { ChatAttachmentRef, ChatMessageContent } from "@/types/chat";

/** Canonical chat attachment rules — mirrors backend `app_chat/contracts.py`. */

export const MAX_CHAT_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024;

export const CHAT_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/webm",
  "audio/wav",
  "audio/ogg",
  "text/plain",
  "application/zip",
] as const;

/** Value for `<input type="file" accept="…">` in chat composers. */
export const CHAT_ATTACHMENT_FILE_INPUT_ACCEPT =
  ".jpg,.jpeg,.png,.gif,.webp,.pdf,.mp4,.m4a,.webm,.mp3,.wav,.ogg,.txt,.zip";

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".webm"] as const;

function attachmentExtension(
  att: Pick<ChatAttachmentRef, "name">
): string {
  const name = att.name || "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function isChatAudioAttachment(
  att: Pick<ChatAttachmentRef, "name" | "mime_type">
): boolean {
  return (
    (att.mime_type?.startsWith("audio/") ?? false) ||
    AUDIO_EXTENSIONS.includes(
      attachmentExtension(att) as (typeof AUDIO_EXTENSIONS)[number]
    )
  );
}

/** Message has attachments only and every attachment is audio (typical voice note). */
export function isAudioOnlyChatAttachmentMessage(
  content:
    | Partial<Pick<ChatMessageContent, "text" | "attachments">>
    | null
    | undefined
): boolean {
  if (!content) return false;
  const text = content.text?.trim() ?? "";
  if (text) return false;
  const attachments = content.attachments ?? [];
  if (attachments.length === 0) return false;
  return attachments.every((att) => isChatAudioAttachment(att));
}
