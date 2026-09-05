import { uploadChatAttachments } from "@/lib/chat/chat-attachments";
import type { ChatMessageContent } from "@/types/chat";

type SendChatMessageFn = (
  content: ChatMessageContent,
  options?: { replyToId?: number }
) => void;

/** Upload a voice clip and send it immediately (bypasses composer attachment staging). */
export async function sendVoiceAttachment(
  file: File,
  foreignKey: string,
  sendMessage: SendChatMessageFn,
  replyToId?: number | null
): Promise<void> {
  const refs = await uploadChatAttachments([file], foreignKey);
  sendMessage(
    { text: "", attachments: refs },
    replyToId != null ? { replyToId } : undefined
  );
}
