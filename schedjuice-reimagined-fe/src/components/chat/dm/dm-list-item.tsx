"use client";
import { Avatar } from "@/components/primitives";

import type { ChatThread } from "@/types/chat";
import { threadListPreviewText } from "@/lib/chat/thread-list-preview";
import { dmChatCopy } from "@/messages/dm-chat";
import { useQueryClient } from "@tanstack/react-query";
import {
  applyChatThreadSelection,
  type ChatThreadSelectionHandlers,
} from "@/lib/chat/chat-thread-selection";
import { cn } from "@/lib/utils";
import {
  CHAT_THREAD_MESSAGES_CACHE_TIME_MS,
  CHAT_THREAD_MESSAGES_STALE_MS,
  chatThreadMessagesQueryKey,
  fetchThreadMessages,
} from "@/lib/chat-threads/chat-messages-query";

const rowClassName = (active: boolean) =>
  cn(
    "w-full rounded-md p-3 text-left transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quiet)] touch-action-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "flex items-center gap-3",
    active
      ? "bg-surface-active text-text-primary"
      : "text-text-primary hover:bg-surface-hover",
  );

export default function DmListItem({
  thread,
  selectionHandlers,
  isActive = false,
}: {
  thread: ChatThread;
  selectionHandlers: ChatThreadSelectionHandlers;
  isActive?: boolean;
}) {
  const queryClient = useQueryClient();

  const other = thread.other_participant;
  const title =
    other?.name?.trim() ||
    other?.email?.trim() ||
    `${dmChatCopy.directMessageSubtitle} · #${thread.id}`;
  const initials = (
    title.length >= 2 ? title.slice(0, 2) : title.padEnd(2, "?")
  ).toUpperCase();
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
            kind: "dm",
            threadId: thread.id,
            otherParticipant: thread.other_participant ?? undefined,
            title: title,
          },
          selectionHandlers,
        )
      }
      aria-label={`Open direct messages with ${title}`}
      aria-current={isActive ? "true" : undefined}
    >
      <div className="shrink-0">
        <Avatar className="w-11 h-11 rounded-full" src={other?.profile_image ?? undefined} name={initials} />
      </div>
      <div className="flex flex-col justify-center items-start gap-0.5 min-w-0 flex-1 overflow-hidden">
        <p className="font-medium truncate w-full text-sm">{title}</p>
        <p className="w-full truncate text-xs text-text-muted">
          {threadListPreviewText(thread.last_message)}
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
