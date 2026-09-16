import type { ChatThreadLastMessage } from "@/types/chat";
import { isAudioOnlyChatAttachmentMessage } from "@/lib/chat/chat-attachment-contracts";
import { emojify } from "@/lib/emoji";
import { chatComposerCopy } from "@/messages/chat-composer";
import { dmChatCopy } from "@/messages/dm-chat";

const PREVIEW_MAX_LEN = 120;

export type ThreadListPreviewLabels = {
  noMessagesYet: string;
  attachment: string;
  voiceMessage: string;
};

const defaultLabels: ThreadListPreviewLabels = {
  noMessagesYet: dmChatCopy.threadPreviewFallback,
  attachment: dmChatCopy.threadPreviewAttachment,
  voiceMessage: chatComposerCopy.voiceMessagePreview,
};

/** Plain last-message preview for inbox rows (mobile parity — no author prefix). */
export function threadListPreviewText(
  lastMessage: ChatThreadLastMessage | null | undefined,
  labels: ThreadListPreviewLabels = defaultLabels,
): string {
  if (!lastMessage) return labels.noMessagesYet;

  const raw =
    typeof lastMessage.content?.text === "string"
      ? lastMessage.content.text.trim()
      : "";
  const hasAttachments =
    Array.isArray(lastMessage.content?.attachments) &&
    lastMessage.content.attachments!.length > 0;

  if (raw) {
    const text =
      raw.length > PREVIEW_MAX_LEN
        ? `${raw.slice(0, PREVIEW_MAX_LEN)}…`
        : raw;
    return emojify(text);
  }

  if (hasAttachments) {
    if (isAudioOnlyChatAttachmentMessage(lastMessage.content)) {
      return labels.voiceMessage;
    }
    return labels.attachment;
  }

  return labels.noMessagesYet;
}
