import type { ChatMessage, ChatReplyToPreview } from "@/types/chat";
import {
  isChatMessageRowDeleted,
  isReplyPreviewDeleted,
} from "@/lib/chat-message-deleted";

export type ReplyPreviewLabels = {
  messageDeleted: string;
  messageFallback: string;
  unknownUser: string;
};

const DEFAULT_LABELS: ReplyPreviewLabels = {
  messageDeleted: "Message deleted",
  messageFallback: "Message",
  unknownUser: "Member",
};

export function replyPreviewFromRef(
  reply: ChatReplyToPreview,
  labels: ReplyPreviewLabels = DEFAULT_LABELS
): { name: string; snippet: string } {
  const u = reply.user;
  const name =
    typeof u === "object" && u && "name" in u && u.name
      ? String(u.name)
      : labels.unknownUser;
  if (isReplyPreviewDeleted(reply)) {
    return { name, snippet: labels.messageDeleted };
  }
  const t = reply.content?.text?.trim() ?? "";
  const snippet =
    t.length > 120 ? `${t.slice(0, 120)}…` : t || labels.messageFallback;
  return { name, snippet };
}

export function lookupReplyPreviewForOutbox(
  messages: ChatMessage[],
  replyToId: number | undefined,
  labels: ReplyPreviewLabels = DEFAULT_LABELS
): { authorName: string; text: string } | null {
  if (replyToId == null) return null;
  const found = messages.find((m) => m.id === replyToId);
  if (!found) {
    return {
      authorName: labels.unknownUser,
      text: labels.messageFallback,
    };
  }
  const u = found.user;
  const authorName =
    typeof u === "object" && u?.name ? u.name : labels.unknownUser;
  if (isChatMessageRowDeleted(found)) {
    return { authorName, text: labels.messageDeleted };
  }
  const t = found.content?.text?.trim() ?? "";
  return {
    authorName,
    text: t.length > 80 ? `${t.slice(0, 80)}…` : t || labels.messageFallback,
  };
}
