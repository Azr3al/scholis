"use client";
import { Avatar } from "@/components/primitives";

import type { ChatThread } from "@/types/chat";
import { isAudioOnlyChatAttachmentMessage } from "@/lib/chat/chat-attachment-contracts";
import { groupChatSenderDisplayName } from "@/lib/chat/group-chat-sender-display-name";
import {
  applyChatThreadSelection,
  type ChatThreadSelectionHandlers,
} from "@/lib/chat/chat-thread-selection";
import { cn } from "@/lib/utils";
import { emojify } from "@/lib/emoji";
import { chatComposerCopy } from "@/messages/chat-composer";
import { dmChatCopy } from "@/messages/dm-chat";
import { useUser } from "@/hooks/useUser";
import type { accountType } from "@/types/user";
import { useQueryClient } from "@tanstack/react-query";
import {
  CHAT_THREAD_MESSAGES_CACHE_TIME_MS,
  CHAT_THREAD_MESSAGES_STALE_MS,
  chatThreadMessagesQueryKey,
  fetchThreadMessages,
} from "@/lib/chat-threads/chat-messages-query";

function groupPreviewText(
  thread: ChatThread,
  viewer: accountType | null | undefined,
): string {
  const last = thread.last_message;
  if (!last) return dmChatCopy.threadPreviewFallback;
  const raw =
    typeof last.content?.text === "string" ? last.content.text.trim() : "";
  const hasAttachments =
    Array.isArray(last.content?.attachments) &&
    last.content.attachments!.length > 0;
  if ((!raw || raw.length === 0) && hasAttachments) {
    if (isAudioOnlyChatAttachmentMessage(last.content)) {
      return chatComposerCopy.voiceMessagePreview;
    }
    return dmChatCopy.threadPreviewAttachment;
  }
  if (!raw) return dmChatCopy.threadPreviewAttachment;
  const text = emojify(raw.length > 120 ? `${raw.slice(0, 120)}…` : raw);
  const lastUser = typeof last.user === "object" ? last.user : null;
  const defaultAuthor =
    typeof lastUser?.name === "string" && lastUser.name.trim().length > 0
      ? lastUser.name.trim()
      : dmChatCopy.unknownUserLabel;
  const author =
    lastUser && viewer
      ? groupChatSenderDisplayName({
          viewer,
          authorUserId: lastUser.id,
          authorNameFromMessage: defaultAuthor,
          participants: thread.participants,
          anchorUserId: thread.anchor_user_id,
          teacherLabel: dmChatCopy.teacherSenderLabel,
        })
      : defaultAuthor;
  return `${author}: ${text}`;
}

const rowClassName = (active: boolean) =>
  cn(
    "w-full rounded-md p-3 text-left transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quiet)] touch-action-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "flex items-center gap-3",
    active
      ? "bg-surface-active text-text-primary"
      : "text-text-primary hover:bg-surface-hover",
  );

export default function GroupListItem({
  thread,
  selectionHandlers,
  isActive = false,
}: {
  thread: ChatThread;
  selectionHandlers: ChatThreadSelectionHandlers;
  isActive?: boolean;
}) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const title =
    thread.display_title?.trim() ||
    (typeof thread.course === "object" ? thread.course.title : "") ||
    `Class chat · #${thread.id}`;
  const initials = (title.length >= 2 ? title.slice(0, 2) : title.padEnd(2, "?")).toUpperCase();
  const unread = typeof thread.unread_count === "number" ? thread.unread_count : 0;

  const prefetch = () => {
    queryClient.prefetchQuery({
      queryKey: chatThreadMessagesQueryKey(thread.id),
      queryFn: () => fetchThreadMessages(thread.id),
      staleTime: CHAT_THREAD_MESSAGES_STALE_MS,
      cacheTime: CHAT_THREAD_MESSAGES_CACHE_TIME_MS,
    });
  };

  return (
    <button
      type="button"
      className={rowClassName(isActive)}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onClick={() =>
        applyChatThreadSelection(
          {
            kind: "group",
            threadId: thread.id,
            title,
          },
          selectionHandlers,
        )
      }
      aria-label={`Open class chat ${title}`}
      aria-current={isActive ? "true" : undefined}
    >
      <div className="shrink-0">
        <Avatar className="w-11 h-11 rounded-full" name={initials} />
      </div>
      <div className="flex flex-col justify-center items-start gap-0.5 min-w-0 flex-1 overflow-hidden">
        <p className="font-medium truncate w-full text-sm">{title}</p>
        <p className="w-full truncate text-xs text-text-muted">
          {groupPreviewText(thread, user)}
        </p>
      </div>
      {unread > 0 ? (
        <span
          className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-chrome)] bg-surface-hover px-1.5 text-xs font-medium text-text-secondary"
          aria-label={dmChatCopy.unreadBadgeAria}
          title={dmChatCopy.unreadBadgeAria}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}
