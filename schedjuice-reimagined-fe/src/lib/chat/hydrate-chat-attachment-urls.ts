import type { ChatAttachmentRef, ChatMessage } from "@/types/chat";
import { normalizeChatAttachmentRef } from "@/lib/chat/normalize-chat-attachment-ref";

export function collectChatAttachmentIds(messages: ChatMessage[]): number[] {
  const ids = new Set<number>();
  for (const msg of messages) {
    const attachments = msg.content?.attachments;
    if (!Array.isArray(attachments)) continue;
    for (const att of attachments) {
      if (att?.attachment_id != null && Number.isFinite(att.attachment_id)) {
        ids.add(att.attachment_id);
      }
    }
  }
  return Array.from(ids).sort((a, b) => a - b);
}

export function buildChatAttachmentUrlMap(
  refs: ChatAttachmentRef[]
): Map<number, ChatAttachmentRef> {
  const map = new Map<number, ChatAttachmentRef>();
  for (const ref of refs) {
    map.set(ref.attachment_id, ref);
  }
  return map;
}

export function stripBackendAttachmentUrls(message: ChatMessage): ChatMessage {
  const attachments = message.content.attachments;
  if (!attachments?.length) return message;
  return {
    ...message,
    content: {
      ...message.content,
      attachments: attachments.map(({ download_url: _downloadUrl, ...rest }) => rest),
    },
  };
}

export function hydrateChatAttachmentRef(
  ref: ChatAttachmentRef,
  urlMap: Map<number, ChatAttachmentRef>
): ChatAttachmentRef {
  const normalized = normalizeChatAttachmentRef(ref);
  const fromJuiceBox = urlMap.get(normalized.attachment_id);
  const download_url = fromJuiceBox?.download_url || normalized.download_url;
  if (!download_url) {
    return normalized;
  }
  return {
    ...normalized,
    download_url,
    name: normalized.name || fromJuiceBox?.name || "",
    mime_type: normalized.mime_type || fromJuiceBox?.mime_type || "application/octet-stream",
    size_bytes: normalized.size_bytes || fromJuiceBox?.size_bytes || 0,
  };
}

export function hydrateChatMessageAttachments(
  message: ChatMessage,
  urlMap: Map<number, ChatAttachmentRef>
): ChatMessage {
  const attachments = message.content.attachments;
  if (!attachments?.length) return message;
  return {
    ...message,
    content: {
      ...message.content,
      attachments: attachments.map((ref) => hydrateChatAttachmentRef(ref, urlMap)),
    },
  };
}
