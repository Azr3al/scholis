"use client";

import React from "react";
import { Avatar } from "@/components/primitives";
import type { ChatThreadLastMessage } from "@/types/chat";
import type { courseType } from "@/types/course";
import { useQueryClient } from "@tanstack/react-query";
import {
  CHAT_THREAD_MESSAGES_CACHE_TIME_MS,
  CHAT_THREAD_MESSAGES_STALE_MS,
  chatThreadMessagesQueryKey,
  fetchThreadMessages,
} from "@/lib/chat-threads/chat-messages-query";
import {
  chatCourseThreadQueryKey,
  resolveCourseThread,
} from "@/lib/chat-threads/chat-threads-api";
import { isAudioOnlyChatAttachmentMessage } from "@/lib/chat/chat-attachment-contracts";
import { emojify } from "@/lib/emoji";
import { chatComposerCopy } from "@/messages/chat-composer";
import { dmChatCopy } from "@/messages/dm-chat";
import {
  applyChatThreadSelection,
  type ChatThreadSelectionHandlers,
} from "@/lib/chat/chat-thread-selection";
import { cn } from "@/lib/utils";

function buildPreviewText(lastMessage: ChatThreadLastMessage | null): string | null {
  if (!lastMessage) return null;
  const author =
    lastMessage.user && typeof lastMessage.user === "object"
      ? lastMessage.user.name
      : null;
  const rawText = lastMessage.content?.text?.trim() ?? null;
  const text = rawText ? emojify(rawText) : null;
  const voicePreview = isAudioOnlyChatAttachmentMessage(lastMessage.content)
    ? chatComposerCopy.voiceMessagePreview
    : null;
  return author && text
    ? `${author}: ${text}`
    : author && voicePreview
      ? `${author}: ${voicePreview}`
      : author
        ? `${author}:`
        : text ?? voicePreview;
}

const rowClassName = (active: boolean) =>
  cn(
    "w-full rounded-md p-3 text-left transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quiet)] touch-action-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "flex items-center gap-3",
    active
      ? "bg-surface-active text-text-primary"
      : "text-text-primary hover:bg-surface-hover",
  );

const ChatListItem = ({
  course,
  lastMessage,
  unreadCount,
  selectionHandlers,
  isActive = false,
}: {
  course: courseType & { student_count?: number; main_teacher_count?: number };
  lastMessage: ChatThreadLastMessage | null;
  unreadCount: number;
  selectionHandlers: ChatThreadSelectionHandlers;
  isActive?: boolean;
}) => {
  const queryClient = useQueryClient();

  const participantCount =
    (course.student_count ?? 0) + (course.main_teacher_count ?? 0) || 1;

  const preview = buildPreviewText(lastMessage);

  const prefetchFullHistory = async () => {
    const cached = queryClient.getQueryData(chatCourseThreadQueryKey(course.id)) as
      | { id: number }
      | undefined;
    let threadId = cached?.id;
    if (!threadId) {
      try {
        const resolved = await resolveCourseThread(course.id);
        threadId = resolved.id;
        queryClient.setQueryData(chatCourseThreadQueryKey(course.id), resolved);
      } catch {
        return;
      }
    }
    if (!threadId) return;
    const resolvedThreadId = threadId;
    queryClient.prefetchQuery({
      queryKey: chatThreadMessagesQueryKey(resolvedThreadId),
      queryFn: () => fetchThreadMessages(resolvedThreadId),
      staleTime: CHAT_THREAD_MESSAGES_STALE_MS,
      cacheTime: CHAT_THREAD_MESSAGES_CACHE_TIME_MS,
    });
  };

  return (
    <button
      type="button"
      className={rowClassName(isActive)}
      onMouseEnter={() => void prefetchFullHistory()}
      onFocus={() => void prefetchFullHistory()}
      onClick={() =>
        applyChatThreadSelection(
          {
            kind: "course",
            courseId: course.id,
            title: course.title,
          },
          selectionHandlers,
        )
      }
      aria-label={`Open chat for ${course.title}`}
      aria-current={isActive ? "true" : undefined}
    >
      <div className="shrink-0">
        <Avatar
          src={undefined}
          name={course.title || "Course"}
          className="h-11 w-11 rounded-full bg-accent/10 text-xs font-medium text-accent"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-0.5 overflow-hidden">
        <p className="w-full truncate text-sm font-medium">
          {course.title || "Untitled Course"}
        </p>
        <p className="w-full truncate text-xs text-text-muted">
          {preview ??
            `${participantCount} participant${participantCount !== 1 ? "s" : ""}`}
        </p>
      </div>
      {unreadCount > 0 ? (
        <span
          className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-surface-hover px-1.5 text-xs text-text-secondary"
          aria-label={dmChatCopy.unreadBadgeAria}
          title={dmChatCopy.unreadBadgeAria}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
};

export default ChatListItem;
