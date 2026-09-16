"use client";

import { Avatar } from "@/components/primitives";
import { Maximize as Maximize2, Xmark as X, ArrowLeft, Send, Emoji, MoreHoriz as MoreHorizontal, Reply, EditPencil as Pencil, Trash as Trash2, Check, Attachment } from "iconoir-react";
import { Button } from "@/components/primitives";
import {
  AlertDialog,
} from "@/components/primitives";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ContentEditableInput, {
  type ContentEditableHandle,
} from "./content-editable-input";
import { useUser } from "@/hooks/useUser";
import { useChatThread } from "@/hooks/useChatThread";
import { useChatMemberAvatars } from "@/hooks/useChatMemberAvatars";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchEntity } from "@/app/client-api/utils";
import type {
  ChatAttachmentRef,
  ChatMention,
  ChatMessage,
  ChatMessageContent,
  ChatMessageUser,
} from "@/types/chat";
import {
  getActiveMentionQuery,
  getCaretPlainOffset,
  replacePlainTextRange,
} from "@/lib/content-editable-plaintext";
import {
  buildChatMentionsFromInsertions,
  filterMentionRoster,
  mentionTokenForMember,
  type CourseChatMentionRosterMember,
} from "@/lib/course-chat-mentions";
import PendingMessageBubble from "./pending-message-bubble";
import {
  MessageReactionChips,
  MessageReactionStrip,
  MessageReactButton,
  useMessageReactionPicker,
} from "@/components/chat/message-reactions";
import { useToast } from "@/components/primitives";
import type { courseType } from "@/types/course";
import { assignedAsEnum } from "@/types/course";
import { cn } from "@/lib/utils";
import { emojify } from "@/lib/emoji";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { Menu, Popover } from "@/components/primitives";
import { Skeleton } from "@/components/primitives";
import { ChatAttachmentRenderer } from "./chat-attachment-renderer";
import { buildChatTimeline, type TimelineMsg } from "@/lib/course-chat-timeline";
import {
  messagesForHydration,
  uploadChatAttachments,
} from "@/lib/chat/chat-attachments";
import { CHAT_ATTACHMENT_FILE_INPUT_ACCEPT } from "@/lib/chat/chat-attachment-contracts";
import { sendVoiceAttachment } from "@/lib/chat/send-voice-attachment";
import { useVoiceRecorder } from "@/lib/chat/use-voice-recorder";
import { VoiceRecordButton } from "@/components/chat/voice-record-button";
import { VoiceRecordingOverlay } from "@/components/chat/voice-recording-overlay";
import { chatComposerCopy } from "@/messages/chat-composer";
import { dmChatCopy } from "@/messages/dm-chat";
import { useHydratedChatMessages } from "@/lib/chat/use-hydrated-chat-messages";
import { mergeChatMessagePatchIntoList } from "@/lib/course-chat-merge";
import {
  chatCourseThreadQueryKey,
  chatThreadPresenceQueryKey,
  deleteThreadMessage,
  fetchThreadPresence,
  patchThreadMessage,
  resolveCourseThread,
} from "@/lib/chat-threads/chat-threads-api";
import {
  chatThreadMessagesQueryKey,
  sortChatMessages,
} from "@/lib/chat-threads/chat-messages-query";
import {
  getReadReceiptTargetUserIds,
  isMessageReadByTargets,
  type CourseChatMemberForReceipt,
} from "@/lib/course-chat-read-receipt";
import {
  isChatMessageRowDeleted,
} from "@/lib/chat-message-deleted";
import {
  lookupReplyPreviewForOutbox,
  replyPreviewFromRef,
} from "@/lib/chat/reply-preview";
import { role } from "@/types/user";

type DisplayRow =
  | { kind: "server"; msg: ChatMessage }
  | { kind: "outbox"; item: import("@/types/chat").ChatOutboxItem };

type RunPosition = "single" | "first" | "middle" | "last";

function ChatTimelineSkeleton() {
  return (
    <div className="space-y-4 py-4" aria-busy="true">
      {Array.from({ length: 5 }).map((_, index) => {
        const own = index % 2 === 1;
        return (
          <div
            key={index}
            className={cn("flex items-end gap-2", own && "justify-end")}
          >
            {!own ? <Skeleton className="size-8 rounded-full" /> : null}
            <div className={cn("space-y-2", own && "text-right")}>
              <Skeleton
                className={cn(
                  "h-12 rounded-2xl",
                  own ? "w-56 rounded-br-md" : "w-64 rounded-bl-md",
                )}
              />
              <Skeleton className={cn("h-3 w-20", own && "ml-auto")} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getMessageUserId(msg: ChatMessage): number {
  if (typeof msg.user === "object") return msg.user.id;
  return msg.user;
}

function applyOptimisticEditToMessageList(
  list: ChatMessage[],
  messageId: number,
  content: ChatMessageContent
): ChatMessage[] {
  const idx = list.findIndex((m) => m.id === messageId);
  if (idx === -1) return list;
  const next = [...list];
  next[idx] = {
    ...list[idx],
    content: {
      text: content.text,
      mentions: [...(content.mentions ?? [])],
      attachments: [...(content.attachments ?? [])],
    },
  };
  return sortChatMessages(next);
}

function applyOptimisticDeleteToMessageList(
  list: ChatMessage[],
  messageId: number,
  tombstone: { deleted_at: string; deleted_by_id: number | null }
): ChatMessage[] {
  return list.map((m) =>
    m.id === messageId
      ? {
          ...m,
          deleted_at: tombstone.deleted_at,
          deleted_by_id: tombstone.deleted_by_id,
          content: { text: "", mentions: [], attachments: [] },
        }
      : m
  );
}

function outboxTimelineId(localId: string): number {
  let h = 0;
  for (let i = 0; i < localId.length; i++) {
    h = Math.imul(31, h) + localId.charCodeAt(i);
  }
  return h >= 0 ? -h - 1 : h;
}

function mentionInsertionsFromMessage(
  msg: ChatMessage
): { user_id: number; label: string }[] {
  const text = msg.content?.text ?? "";
  const mentions = [...(msg.content?.mentions ?? [])].sort(
    (a, b) => a.offset - b.offset
  );
  return mentions.map((m) => ({
    user_id: m.user_id,
    label: text.slice(m.offset, m.offset + m.length),
  }));
}

function incomingBubbleRounding(runPosition: RunPosition): string {
  switch (runPosition) {
    case "single":
      return "rounded-2xl rounded-bl-md";
    case "first":
      return "rounded-2xl rounded-bl-sm";
    case "middle":
      return "rounded-sm rounded-l-2xl rounded-r-md";
    case "last":
      return "rounded-2xl rounded-tl-sm rounded-bl-md";
    default:
      return "rounded-2xl rounded-bl-md";
  }
}

function outgoingBubbleRounding(runPosition: RunPosition): string {
  switch (runPosition) {
    case "single":
      return "rounded-2xl rounded-br-md";
    case "first":
      return "rounded-2xl rounded-br-sm";
    case "middle":
      return "rounded-sm rounded-r-2xl rounded-l-md";
    case "last":
      return "rounded-2xl rounded-tr-sm rounded-br-md";
    default:
      return "rounded-2xl rounded-br-md";
  }
}

const MessageBubble = ({
  msg,
  isMe,
  runPosition,
  showAuthorLabel,
  showAvatarColumn,
  avatarUrl,
  receiptLine,
  onReply,
  onEdit,
  onDelete,
  onModDelete,
  showReplyAction,
  showEditDelete,
  showModDelete,
  onReactionToggle,
  canReact,
}: {
  msg: ChatMessage;
  isMe: boolean;
  runPosition: RunPosition;
  showAuthorLabel: boolean;
  showAvatarColumn: boolean;
  avatarUrl?: string | null;
  receiptLine?: string | null;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onModDelete?: () => void;
  showReplyAction: boolean;
  showEditDelete: boolean;
  showModDelete: boolean;
  onReactionToggle: (emoji: string) => void;
  canReact: boolean;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    open: reactionOpen,
    setOpen: setReactionOpen,
    rootRef: reactionRootRef,
  } = useMessageReactionPicker();
  const user = typeof msg.user === "object" ? msg.user : null;
  const name = user?.name ?? "Unknown";
  const initials = (name || "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isDeleted = isChatMessageRowDeleted(msg);
  const bubbleRound = isMe
    ? outgoingBubbleRounding(runPosition)
    : incomingBubbleRounding(runPosition);
  const marginClass =
    runPosition === "first" || runPosition === "single" ? "mt-3" : "mt-0.5";

  const renderText = () => {
    if (isDeleted) {
      return (
        <span className="italic text-muted-foreground">Message deleted</span>
      );
    }
    const rawText = msg.content?.text ?? "";
    const mentions = msg.content?.mentions ?? [];
    if (mentions.length === 0) return emojify(rawText);

    const parts: { text: string; isMention: boolean; userId?: number }[] = [];
    let lastEnd = 0;
    [...mentions]
      .sort((a, b) => a.offset - b.offset)
      .forEach((m) => {
        if (m.offset > lastEnd) {
          parts.push({
            text: emojify(rawText.slice(lastEnd, m.offset)),
            isMention: false,
          });
        }
        parts.push({
          text: rawText.slice(m.offset, m.offset + m.length),
          isMention: true,
          userId: m.user_id,
        });
        lastEnd = m.offset + m.length;
      });
    if (lastEnd < rawText.length) {
      parts.push({ text: emojify(rawText.slice(lastEnd)), isMention: false });
    }

    return parts.map((p, i) =>
      p.isMention ? (
        <span
          key={i}
          className={cn(
            "font-semibold underline-offset-2 hover:underline",
            isMe ? "text-primary-foreground" : "text-primary"
          )}
        >
          {p.text}
        </span>
      ) : (
        <span key={i}>{p.text}</span>
      )
    );
  };
  const attachments = msg.content?.attachments ?? [];

  const replyPrev = msg.reply_to ? replyPreviewFromRef(msg.reply_to) : null;

  const hasMenu =
    showReplyAction || showEditDelete || (showModDelete && onModDelete);
  const showActions = canReact || hasMenu;

  return (
    <div
      className={cn(
        "flex gap-2 items-end max-w-[85%] group/msg relative",
        isMe ? "flex-row-reverse ml-auto" : "flex-row",
        marginClass
      )}
    >
      {isMe ? null : showAvatarColumn ? (
        <Avatar
          src={avatarUrl ?? undefined}
          name={name || initials}
          className="w-7 h-7 shrink-0 rounded-full text-[10px] bg-muted"
        />
      ) : (
        <div className="w-7 shrink-0" aria-hidden />
      )}
      <div
        className={cn(
          "flex flex-col min-w-0",
          isMe ? "items-end" : "items-start"
        )}
      >
        {showAuthorLabel && (
          <span className="text-[11px] text-muted-foreground mb-0.5 truncate max-w-[180px]">
            {isMe ? "You" : name}
          </span>
        )}
        <div
          ref={reactionRootRef}
          className={cn(
            "flex items-end gap-0.5 w-fit max-w-full min-w-0 relative",
            isMe ? "flex-row-reverse" : "flex-row"
          )}
        >
          <MessageReactionStrip
            open={reactionOpen && canReact}
            reactions={msg.reactions}
            isMe={isMe}
            onToggleReaction={onReactionToggle}
            onClose={() => setReactionOpen(false)}
          />
          <div
            className={cn(
              "px-3 py-2 text-sm break-words max-w-full min-w-0",
              bubbleRound,
              isMe
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-foreground"
            )}
          >
            {replyPrev && (
              <div
                className={cn(
                  "mb-1.5 pb-1.5 border-b text-left",
                  isMe ? "border-primary-foreground/25" : "border-foreground/10"
                )}
              >
                <p
                  className={cn(
                    "text-[11px] font-medium",
                    isMe ? "text-primary-foreground/90" : "text-foreground/90"
                  )}
                >
                  {replyPrev.name}
                </p>
                <p
                  className={cn(
                    "text-[11px] line-clamp-2",
                    isMe
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  )}
                >
                  {replyPrev.snippet}
                </p>
              </div>
            )}
            <div>{renderText()}</div>
            <ChatAttachmentRenderer attachments={attachments} isMe={isMe} />
          </div>
          {showActions ? (
            <div
              className={cn(
                "shrink-0 z-10 flex flex-col items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity pb-0.5",
                reactionOpen && "opacity-100",
                isMe ? "mr-px" : "ml-px"
              )}
            >
              {canReact ? (
                <MessageReactButton
                  active={reactionOpen}
                  onClick={() => {
                    setReactionOpen((open) => {
                      const next = !open;
                      if (next) setMenuOpen(false);
                      return next;
                    });
                  }}
                />
              ) : null}
              {hasMenu ? (
              <Menu.Root
                modal={false}
                open={menuOpen}
                onOpenChange={(open) => {
                  setMenuOpen(open);
                  if (open) setReactionOpen(false);
                }}
              >
                <Menu.Trigger
                  render={<button
                    type="button"
                    className="p-1 rounded-full text-foreground/55 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label="Message actions"
                  />}
                >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner
                    side={isMe ? "left" : "right"}
                    align="start"
                    sideOffset={4}
                    collisionPadding={8}
                  >
                    <Menu.Popup className="w-44 z-dropdown">
                  {showReplyAction && (
                    <Menu.Item
                      className="gap-2"
                      onClick={() => {
                        onReply();
                      }}
                    >
                      <Reply className="h-4 w-4 shrink-0" aria-hidden />
                      Reply
                    </Menu.Item>
                  )}
                  {showEditDelete && !isDeleted && (
                    <>
                      <Menu.Item
                        className="gap-2"
                        onClick={() => {
                          onEdit();
                        }}
                      >
                        <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                        Edit
                      </Menu.Item>
                      <Menu.Item
                        className="gap-2 text-destructive focus:text-destructive"
                        onClick={() => {
                          onDelete();
                        }}
                      >
                        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                        Delete
                      </Menu.Item>
                    </>
                  )}
                  {showModDelete && onModDelete && (
                    <Menu.Item
                      className="gap-2 text-destructive focus:text-destructive"
                      onClick={() => {
                        onModDelete();
                      }}
                    >
                      <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                      Delete message
                    </Menu.Item>
                  )}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
              ) : null}
            </div>
          ) : null}
        </div>
        <MessageReactionChips
          reactions={msg.reactions}
          isMe={isMe}
          canReact={canReact}
          onToggleReaction={onReactionToggle}
        />
        {receiptLine ? (
          <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
            {receiptLine}
          </p>
        ) : null}
      </div>
    </div>
  );
};

function formatTypingIndicator(
  peers: Map<number, { name: string }>,
  myId: number | undefined
): string | null {
  const entries = Array.from(peers.entries()).filter(([id]) => id !== myId);
  if (entries.length === 0) return null;
  const names = entries.map(([, v]) => v.name).filter(Boolean);
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

const ChatSection = ({
  courseId,
  layout = "panel",
  onExpand,
  handleChatListsClose,
  handleChatSectionBack,
}: {
  courseId: number;
  layout?: "panel" | "page";
  onExpand?: () => void;
  handleChatListsClose: () => void;
  handleChatSectionBack: () => void;
}) => {
  const editableInputRef = useRef<ContentEditableHandle | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insertedMentionsRef = useRef<{ user_id: number; label: string }[]>([]);
  const mentionSuppressRef = useRef(false);
  const mentionPickerRef = useRef<{
    open: boolean;
    query: string;
    filtered: CourseChatMentionRosterMember[];
  }>({ open: false, query: "", filtered: [] });
  const [mentionPicker, setMentionPicker] = useState<{
    open: boolean;
    query: string;
    filtered: CourseChatMentionRosterMember[];
  }>({ open: false, query: "", filtered: [] });
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    kind: "self" | "mod";
    msg: ChatMessage;
  } | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);

  const { user, isAdminOrManager } = useUser();
  const avatars = useChatMemberAvatars(courseId);
  const { data: resolvedThread, isLoading: isResolvingThread } = useQuery({
    queryKey: chatCourseThreadQueryKey(courseId),
    queryFn: () => resolveCourseThread(courseId),
    enabled: Boolean(courseId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const threadId = resolvedThread?.id ?? null;

  const {
    messages,
    outbox,
    retryOutbox,
    isLoading,
    error,
    isConnected,
    sendMessage,
    sendTyping,
    lastReadByUserId,
    typingPeers,
    putReadCursor,
    toggleReaction,
  } = useChatThread(threadId, "course");

  const { data: courseData } = useQuery({
    queryKey: ["course", courseId, "chat-roster"],
    queryFn: () =>
      fetchEntity("courses", courseId, ["user_courses", "user_courses.user"]),
    enabled: Boolean(courseId),
    refetchOnWindowFocus: false,
  });

  const { data: presenceData } = useQuery({
    queryKey: chatThreadPresenceQueryKey(threadId ?? 0),
    queryFn: () => fetchThreadPresence(threadId as number),
    enabled: Boolean(threadId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const course = courseData?.data?.data as courseType | undefined;
  const courseTitle = course?.title ?? "Course";

  const handleReactionToggle = useCallback(
    async (messageId: number, emoji: string) => {
      try {
        await toggleReaction(messageId, emoji);
      } catch {
        toast.add({
          title: "Could not update reaction",
          description: "Please try again.",
        });
      }
    },
    [toggleReaction, toast]
  );

  const mentionRoster = useMemo((): CourseChatMentionRosterMember[] => {
    const ucs = course?.user_courses;
    if (!Array.isArray(ucs)) return [];
    const out: CourseChatMentionRosterMember[] = [];
    for (const uc of ucs as Record<string, unknown>[]) {
      const rawUser = uc.user;
      if (
        typeof rawUser !== "object" ||
        rawUser === null ||
        !("id" in rawUser)
      ) {
        continue;
      }
      const u = rawUser as { id: number; name?: string; email?: string };
      const email = typeof u.email === "string" ? u.email : "";
      const name = typeof u.name === "string" ? u.name.trim() : "";
      out.push({
        userId: u.id,
        name: name || email || "Member",
        email,
      });
    }
    return out;
  }, [course]);

  const membersForReceipt: CourseChatMemberForReceipt[] = useMemo(() => {
    const ucs = course?.user_courses;
    if (!Array.isArray(ucs)) return [];
    return ucs.map((uc: Record<string, unknown>) => {
      const rawUser = uc.user;
      const userId =
        typeof rawUser === "object" &&
        rawUser !== null &&
        "id" in rawUser &&
        typeof (rawUser as { id: unknown }).id === "number"
          ? (rawUser as { id: number }).id
          : typeof rawUser === "number"
            ? rawUser
            : 0;
      const org_roles =
        typeof rawUser === "object" &&
        rawUser !== null &&
        "roles" in rawUser &&
        Array.isArray((rawUser as { roles: unknown }).roles)
          ? ((rawUser as { roles: role[] }).roles)
          : undefined;
      return {
        userId,
        assigned_as:
          uc.assigned_as === assignedAsEnum.student ? "student" : "teacher",
        org_roles,
      };
    });
  }, [course]);

  /**
   * If `user_courses.user` is not expanded, `org_roles` is missing and courses with
   * &gt;30 members only count teachers toward Read (closest FE match to backend staff receipts).
   */
  const receiptTargetIds = useMemo(() => {
    if (!course || !user?.id) return null;
    return getReadReceiptTargetUserIds(membersForReceipt, user.id);
  }, [course, membersForReceipt, user?.id]);

  const isCourseTeacher = useMemo(() => {
    if (!user?.id || !course?.user_courses || !Array.isArray(course.user_courses)) {
      return false;
    }
    return course.user_courses.some((uc: Record<string, unknown>) => {
      const rawUser = uc.user;
      const uid =
        typeof rawUser === "object" &&
        rawUser !== null &&
        "id" in rawUser &&
        typeof (rawUser as { id: unknown }).id === "number"
          ? (rawUser as { id: number }).id
          : typeof rawUser === "number"
            ? rawUser
            : null;
      return (
        uid === user.id && uc.assigned_as === assignedAsEnum.teacher
      );
    });
  }, [course, user?.id]);

  const canModerate = Boolean(isAdminOrManager || isCourseTeacher);

  const authorAssignedAs = useCallback(
    (authorId: number): "teacher" | "student" | null => {
      const ucs = course?.user_courses;
      if (!Array.isArray(ucs)) return null;
      for (const uc of ucs as Record<string, unknown>[]) {
        const rawUser = uc.user;
        const uid =
          typeof rawUser === "object" &&
          rawUser !== null &&
          "id" in rawUser &&
          typeof (rawUser as { id: unknown }).id === "number"
            ? (rawUser as { id: number }).id
            : typeof rawUser === "number"
              ? rawUser
              : null;
        if (uid === authorId) {
          return uc.assigned_as === assignedAsEnum.student
            ? "student"
            : "teacher";
        }
      }
      return null;
    },
    [course]
  );

  const hydrationInput = useMemo(
    () =>
      messagesForHydration(
        messages,
        outbox,
        user?.id ?? 0,
        outboxTimelineId
      ),
    [messages, outbox, user?.id]
  );
  const hydratedMessages = useHydratedChatMessages(hydrationInput);
  const hydratedById = useMemo(() => {
    const map = new Map<number, ChatMessage>();
    for (const msg of hydratedMessages) {
      map.set(msg.id, msg);
    }
    return map;
  }, [hydratedMessages]);

  const displayRows: DisplayRow[] = useMemo(() => {
    const server = messages.map((msg) => {
      const hydrated = hydratedById.get(msg.id);
      return { kind: "server" as const, msg: hydrated ?? msg };
    });
    const ob = outbox.map((item) => {
      const pseudoId = outboxTimelineId(item.localId);
      const hydrated = hydratedById.get(pseudoId);
      if (hydrated) {
        return {
          kind: "outbox" as const,
          item: { ...item, content: hydrated.content },
        };
      }
      return { kind: "outbox" as const, item };
    });
    return [...server, ...ob].sort((a, b) => {
      const ta =
        a.kind === "server"
          ? new Date(a.msg.created_at).getTime()
          : a.item.createdAt;
      const tb =
        b.kind === "server"
          ? new Date(b.msg.created_at).getTime()
          : b.item.createdAt;
      if (ta !== tb) return ta - tb;
      const sa =
        a.kind === "server" ? `s-${a.msg.id}` : `o-${a.item.localId}`;
      const sb =
        b.kind === "server" ? `s-${b.msg.id}` : `o-${b.item.localId}`;
      return sa.localeCompare(sb);
    });
  }, [messages, outbox, hydratedById]);

  const timelineInputs: TimelineMsg[] = useMemo(() => {
    const uid = user?.id ?? 0;
    return displayRows.map((row) => {
      if (row.kind === "server") {
        return {
          id: row.msg.id,
          userId: getMessageUserId(row.msg),
          createdAt: row.msg.created_at,
        };
      }
      return {
        id: outboxTimelineId(row.item.localId),
        userId: uid,
        createdAt: new Date(row.item.createdAt).toISOString(),
      };
    });
  }, [displayRows, user?.id]);

  const formatDate = useCallback((d: Date) => {
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, []);

  const formatTime = useCallback((d: Date) => {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  const timelineItems = useMemo(
    () => buildChatTimeline(timelineInputs, formatDate, formatTime),
    [timelineInputs, formatDate, formatTime]
  );

  const typingLine = useMemo(
    () => formatTypingIndicator(typingPeers, user?.id),
    [typingPeers, user?.id]
  );

  const onlineCount = Array.isArray(presenceData) ? presenceData.length : 0;

  const handleVoiceRecordingComplete = useCallback(
    async (
      file: File | null,
      reason: "sent" | "cancelled" | "too_short"
    ) => {
      if (reason === "too_short") {
        toast.add({ description: chatComposerCopy.recordingTooShort });
        return;
      }
      if (!file || threadId == null) return;

      setIsSendingVoice(true);
      try {
        await sendVoiceAttachment(
          file,
          String(threadId),
          sendMessage,
          replyTarget?.id
        );
        setReplyTarget(null);
        sendTyping(false);
      } catch {
        setComposerError("Upload failed. Please try again.");
      } finally {
        setIsSendingVoice(false);
      }
    },
    [threadId, replyTarget?.id, sendMessage, sendTyping, toast]
  );

  const {
    status: voiceRecordingStatus,
    durationMs: voiceDurationMs,
    isRecording: isVoiceRecording,
    isSupported: isVoiceRecordingSupported,
    micButtonProps,
    recordingContainerProps,
  } = useVoiceRecorder({
    disabled: isUploadingAttachments || isSendingVoice || threadId == null,
    onPermissionDenied: () => {
      toast.add({
        description: chatComposerCopy.micPermissionDenied,
      });
    },
    onRecordingComplete: (file, reason) => {
      void handleVoiceRecordingComplete(file, reason);
    },
  });

  const showVoiceMic =
    isVoiceRecordingSupported &&
    composerText.trim().length === 0 &&
    selectedFiles.length === 0 &&
    !editTarget;

  const canSend =
    !isUploadingAttachments &&
    !isSendingVoice &&
    voiceRecordingStatus === "idle" &&
    (composerText.trim().length > 0 || selectedFiles.length > 0);

  useEffect(() => {
    mentionPickerRef.current = mentionPicker;
  }, [mentionPicker]);

  const syncMentionUi = useCallback(() => {
    const el = editableInputRef.current?.element;
    if (!el) return;
    const text = el.innerText ?? "";
    const caret = getCaretPlainOffset(el);
    if (mentionSuppressRef.current) {
      const active = getActiveMentionQuery(text, caret);
      if (!active) mentionSuppressRef.current = false;
      setMentionPicker((p) => ({ ...p, open: false }));
      return;
    }
    const active = getActiveMentionQuery(text, caret);
    if (!active) {
      setMentionPicker({ open: false, query: "", filtered: [] });
      return;
    }
    const filtered = filterMentionRoster(mentionRoster, active.query);
    const open = filtered.length > 0;
    setMentionPicker({
      open,
      query: active.query,
      filtered,
    });
  }, [mentionRoster]);

  const onComposerInput = useCallback(() => {
    setComposerText(editableInputRef.current?.getText() ?? "");
    sendTyping(true);
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    typingIdleRef.current = setTimeout(() => {
      sendTyping(false);
      typingIdleRef.current = null;
    }, 2000);
    syncMentionUi();
  }, [sendTyping, syncMentionUi]);

  const applyMentionPick = useCallback(
    (member: CourseChatMentionRosterMember) => {
      const el = editableInputRef.current?.element ?? null;
      if (!el) return;
      const text = el.innerText ?? "";
      const caret = getCaretPlainOffset(el);
      const active = getActiveMentionQuery(text, caret);
      if (!active) return;
      const token = mentionTokenForMember(member, mentionRoster);
      const ok = replacePlainTextRange(
        el,
        active.atIndex,
        caret,
        `${token} `
      );
      if (!ok) return;
      insertedMentionsRef.current = [
        ...insertedMentionsRef.current,
        { user_id: member.userId, label: token },
      ];
      setMentionPicker({ open: false, query: "", filtered: [] });
      mentionSuppressRef.current = false;
      el.focus();
      onComposerInput();
    },
    [mentionRoster, onComposerInput]
  );

  const mentionHighlightRef = useRef(0);
  useEffect(() => {
    mentionHighlightRef.current = mentionHighlight;
  }, [mentionHighlight]);

  const composerKeyUp = useCallback(() => {
    syncMentionUi();
  }, [syncMentionUi]);

  const handleComposerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const mp = mentionPickerRef.current;
      if (!mp.open || mp.filtered.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionHighlight((i) => {
          const n = mentionPickerRef.current.filtered.length;
          if (n === 0) return 0;
          return (i + 1) % n;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionHighlight((i) => {
          const n = mentionPickerRef.current.filtered.length;
          if (n === 0) return 0;
          return (i - 1 + n) % n;
        });
      } else if (e.key === "Escape") {
        e.preventDefault();
        mentionSuppressRef.current = true;
        setMentionPicker((p) => ({ ...p, open: false }));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const choices = mentionPickerRef.current.filtered;
        const hl = Math.min(
          mentionHighlightRef.current,
          Math.max(0, choices.length - 1)
        );
        const pick = choices[hl];
        if (pick) applyMentionPick(pick);
      }
    },
    [applyMentionPick]
  );

  useEffect(() => {
    setMentionHighlight(0);
  }, [mentionPicker.query]);

  const patchMessage = async (
    messageId: number,
    text: string,
    mentions: ChatMention[]
  ) => {
    if (threadId == null) return;
    const row = await patchThreadMessage(threadId, messageId, {
      text,
      mentions,
    });
    queryClient.setQueryData<ChatMessage[]>(
      chatThreadMessagesQueryKey(threadId),
      (prev) => {
        const base = prev ?? [];
        const next = mergeChatMessagePatchIntoList(base, row);
        return sortChatMessages(next);
      }
    );
    // Do not invalidate the full list here: refetch used page=1 with a sort that
    // previously took the *oldest* slice only, replacing the cache and dropping
    // newer rows (and any WS-only rows). PATCH body + message_edited keep this
    // client consistent; other members get the WS event.
  };

  const deleteMessageById = async (
    messageId: number,
    kind: "self" | "mod"
  ) => {
    if (threadId == null) return;
    const messagesKey = chatThreadMessagesQueryKey(threadId);
    const listBefore = queryClient.getQueryData<ChatMessage[]>(messagesKey) ?? [];
    const prevRow = listBefore.find((m) => m.id === messageId);
    const rolledBack: ChatMessage | undefined =
      prevRow !== undefined ? (structuredClone(prevRow) as ChatMessage) : undefined;

    const deletedById =
      kind === "mod" && user?.id != null ? user.id : null;
    const optimisticAt = new Date().toISOString();

    queryClient.setQueryData<ChatMessage[]>(messagesKey, (prev) =>
      applyOptimisticDeleteToMessageList(prev ?? [], messageId, {
        deleted_at: optimisticAt,
        deleted_by_id: deletedById,
      })
    );

    if (editTarget?.id === messageId) {
      setEditTarget(null);
      insertedMentionsRef.current = [];
      setMentionPicker({ open: false, query: "", filtered: [] });
      editableInputRef.current?.clear();
      setComposerText("");
    }
    if (replyTarget?.id === messageId) {
      setReplyTarget(null);
    }

    try {
      const row = await deleteThreadMessage(threadId, messageId);
      if (
        row &&
        typeof row.id === "number" &&
        typeof row.deleted_at === "string"
      ) {
        queryClient.setQueryData<ChatMessage[]>(messagesKey, (prev) => {
          const base = prev ?? [];
          return base.map((m) =>
            m.id === row.id
              ? {
                  ...m,
                  deleted_at: row.deleted_at,
                  deleted_by_id:
                    row.deleted_by_id === undefined ? null : row.deleted_by_id,
                  content: { text: "", mentions: [], attachments: [] },
                }
              : m
          );
        });
      }
    } catch {
      if (rolledBack !== undefined) {
        queryClient.setQueryData<ChatMessage[]>(messagesKey, (prev) => {
          const base = prev ?? [];
          const idx = base.findIndex((m) => m.id === messageId);
          if (idx === -1) {
            return sortChatMessages([...base, rolledBack]);
          }
          const next = [...base];
          next[idx] = rolledBack;
          return sortChatMessages(next);
        });
      }
    }
  };

  const cancelEdit = useCallback(() => {
    setEditTarget(null);
    insertedMentionsRef.current = [];
    setMentionPicker({ open: false, query: "", filtered: [] });
    editableInputRef.current?.clear();
    setComposerText("");
  }, []);

  const startEditingMessage = useCallback(
    (msg: ChatMessage) => {
      setReplyTarget(null);
      setEditTarget(msg);
      insertedMentionsRef.current = mentionInsertionsFromMessage(msg);
      setMentionPicker({ open: false, query: "", filtered: [] });
      mentionSuppressRef.current = false;
      const raw = msg.content?.text ?? "";
      queueMicrotask(() => {
        editableInputRef.current?.setPlainText(raw);
        setComposerText(raw);
        editableInputRef.current?.focus();
        syncMentionUi();
      });
    },
    [syncMentionUi]
  );

  const beginReply = useCallback((msg: ChatMessage) => {
    setEditTarget(null);
    insertedMentionsRef.current = [];
    setMentionPicker({ open: false, query: "", filtered: [] });
    editableInputRef.current?.clear();
    setComposerText("");
    setReplyTarget(msg);
  }, []);

  const handleSendMessage = async (text: string) => {
    const trimmed = text?.trim();
    if (!trimmed && selectedFiles.length === 0) {
      return;
    }
    setComposerError(null);
    const withEmoji = emojify(trimmed);
    const mentions = buildChatMentionsFromInsertions(
      withEmoji,
      insertedMentionsRef.current
    );

    let attachmentRefs: ChatAttachmentRef[] = [];
    if (selectedFiles.length > 0) {
      setIsUploadingAttachments(true);
      try {
        attachmentRefs = await uploadChatAttachments(
          selectedFiles,
          String(threadId)
        );
      } catch {
        setComposerError("Upload failed. Please try again.");
        setIsUploadingAttachments(false);
        return;
      } finally {
        setIsUploadingAttachments(false);
      }
    }

    if (editTarget) {
      const editingSession = editTarget;
      const messageId = editingSession.id;
      const messagesKey = chatThreadMessagesQueryKey(threadId!);
      const listBefore =
        queryClient.getQueryData<ChatMessage[]>(messagesKey) ?? [];
      const snapshotForRollback = listBefore.find((m) => m.id === messageId);
      const rolledBack: ChatMessage | undefined =
        snapshotForRollback !== undefined
          ? (structuredClone(snapshotForRollback) as ChatMessage)
          : undefined;

      queryClient.setQueryData<ChatMessage[]>(messagesKey, (prev) =>
        applyOptimisticEditToMessageList(prev ?? [], messageId, {
          text: withEmoji,
          attachments: editTarget.content?.attachments ?? [],
          mentions,
        })
      );
      insertedMentionsRef.current = [];
      setEditTarget(null);
      setMentionPicker({ open: false, query: "", filtered: [] });
      editableInputRef.current?.clear();
      setComposerText("");
      try {
        await patchMessage(messageId, withEmoji, mentions);
      } catch {
        if (rolledBack !== undefined) {
          queryClient.setQueryData<ChatMessage[]>(messagesKey, (prev) => {
            const base = prev ?? [];
            const idx = base.findIndex((m) => m.id === messageId);
            if (idx === -1) {
              return sortChatMessages([...base, rolledBack]);
            }
            const next = [...base];
            next[idx] = rolledBack;
            return sortChatMessages(next);
          });
        }
        const resume: ChatMessage = {
          ...editingSession,
          content: { text: withEmoji, mentions },
        };
        setEditTarget(resume);
        insertedMentionsRef.current = mentionInsertionsFromMessage(resume);
        mentionSuppressRef.current = false;
        queueMicrotask(() => {
          editableInputRef.current?.setPlainText(withEmoji);
          setComposerText(withEmoji);
          editableInputRef.current?.focus();
          syncMentionUi();
        });
      }
      return;
    }

    insertedMentionsRef.current = [];
    const replyToId = replyTarget?.id;
    sendMessage(
      { text: withEmoji, mentions, attachments: attachmentRefs },
      replyToId != null ? { replyToId } : undefined
    );
    setReplyTarget(null);
    setMentionPicker({ open: false, query: "", filtered: [] });
    setSelectedFiles([]);
    editableInputRef.current?.clear();
    setComposerText("");
  };

  const handleComposerPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const seen = new Map<string, File>();
      for (let i = 0; i < dt.files.length; i++) {
        const f = dt.files.item(i);
        if (f && f.size > 0) seen.set(`${f.name}-${f.size}`, f);
      }
      for (let i = 0; i < dt.items.length; i++) {
        const it = dt.items[i];
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f && f.size > 0) seen.set(`${f.name}-${f.size}`, f);
        }
      }
      const files = Array.from(seen.values());
      if (files.length === 0) return;
      e.preventDefault();
      const maxBytes = 15 * 1024 * 1024;
      const bad = files.find((f) => f.size > maxBytes);
      if (bad) {
        setComposerError(`"${bad.name}" is larger than 15 MB.`);
        return;
      }
      setComposerError(null);
      setSelectedFiles((prev) => [...prev, ...files]);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
      sendTyping(false);
    };
  }, [sendTyping]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const th = 120;
      isNearBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < th;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!isNearBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, outbox]);

  useEffect(() => {
    if (!isNearBottomRef.current) return;
    const last = messages[messages.length - 1];
    if (last?.id) {
      void putReadCursor(last.id);
    }
  }, [messages, putReadCursor]);

  useEffect(() => {
    insertedMentionsRef.current = [];
    setMentionPicker({ open: false, query: "", filtered: [] });
    mentionSuppressRef.current = false;
    setEditTarget(null);
    setReplyTarget(null);
    setComposerText("");
    const t = setTimeout(() => editableInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [courseId]);

  const replyTargetLabel = useMemo(() => {
    if (!replyTarget) return "";
    const u = replyTarget.user;
    if (typeof u === "object" && u?.name) return u.name;
    return "Message";
  }, [replyTarget]);

  const editTargetPreview = useMemo(() => {
    if (!editTarget) return "";
    const t = editTarget.content?.text ?? "";
    return t.length > 120 ? `${t.slice(0, 120)}…` : t;
  }, [editTarget]);

  const mentionChoices = mentionPicker.filtered;
  const mentionHl = Math.min(
    mentionHighlight,
    Math.max(0, mentionChoices.length - 1)
  );

  const lookupReplyPreviewForOutboxMemo = useCallback(
    (replyToId: number | undefined) =>
      lookupReplyPreviewForOutbox(messages, replyToId),
    [messages]
  );

  return (
    <>
      <AlertDialog.Root
        open={deleteDialog != null}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>
              {deleteDialog?.kind === "mod"
                ? "Delete this message as a moderator?"
                : "Delete this message?"}
            </AlertDialog.Title>
            <AlertDialog.Description>
              {deleteDialog?.kind === "mod"
                ? "The author will see that this message was removed."
                : "This message will be removed for everyone in the course."}
            </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Close render={<Button type="button" variant="ghost" />}>
              Cancel
            </AlertDialog.Close>
            <AlertDialog.Close
              render={
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    const d = deleteDialog;
                    setDeleteDialog(null);
                    if (d) void deleteMessageById(d.msg.id, d.kind);
                  }}
                />
              }
            >
              Delete
            </AlertDialog.Close>
          </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <header className="shrink-0 px-4 py-3 border-b flex items-center gap-3">
        <button
          type="button"
          className={cn(
            "p-1.5 -ml-1 rounded-full hover:bg-muted/50 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            layout === "page" && "lg:hidden",
          )}
          onClick={handleChatSectionBack}
          aria-label="Back to chat list"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <Avatar
          src={undefined}
          name={courseTitle || "Course"}
          className="w-9 h-9 shrink-0 rounded-full text-xs bg-primary/10 text-primary"
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-sm">{courseTitle}</p>
          <p className="text-xs text-muted-foreground">
            Group chat
            {onlineCount > 0 ? ` · ${onlineCount} online` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {layout === "panel" && onExpand ? (
            <button
              type="button"
              className="p-2 rounded-full hover:bg-muted/50 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={onExpand}
              aria-label={dmChatCopy.expandChatAria}
            >
              <Maximize2 className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          {layout === "panel" ? (
            <button
              type="button"
              className="p-2 rounded-full hover:bg-muted/50 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={handleChatListsClose}
              aria-label="Close chat"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3"
        >
          <div className="max-w-[85%] mx-auto mb-4 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {courseTitle}
            </p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Messages are not end-to-end encrypted. Anyone in this course can
              read them.
            </p>
          </div>

          {isLoading || isResolvingThread ? (
            <ChatTimelineSkeleton />
          ) : (
            <div className="space-y-0">
              {timelineItems.map((item) => {
                if (item.kind === "date" || item.kind === "time") {
                  return (
                    <div
                      key={item.key}
                      className="flex justify-center my-2"
                    >
                      <span className="text-[11px] text-muted-foreground bg-muted/50 px-2.5 py-0.5 rounded-full">
                        {item.label}
                      </span>
                    </div>
                  );
                }
                const row = displayRows[item.messageIndex];
                const runPosition = item.runPosition;
                const showAuthorLabel =
                  runPosition === "first" || runPosition === "single";

                if (row.kind === "outbox") {
                  const replyPreview = row.item.reply_to_id
                    ? lookupReplyPreviewForOutboxMemo(row.item.reply_to_id)
                    : null;
                  return (
                    <PendingMessageBubble
                      key={`out-${row.item.localId}`}
                      item={row.item}
                      onRetry={retryOutbox}
                      showAuthor={showAuthorLabel}
                      avatarUrl={user?.profile_image ?? null}
                      runPosition={runPosition}
                      hideAvatar
                      replyPreview={replyPreview ?? undefined}
                      webSocketReady={isConnected}
                    />
                  );
                }

                const msg = row.msg;
                const isMe =
                  typeof msg.user === "object"
                    ? msg.user.id === user?.id
                    : msg.user === user?.id;
                const authorId = getMessageUserId(msg);
                const avatarUrl =
                  isMe && user?.profile_image
                    ? user.profile_image
                    : avatars[authorId] ?? null;

                const showAvatarColumn =
                  !isMe &&
                  (runPosition === "last" || runPosition === "single");

                let receiptLine: string | null = null;
                const showReceiptOnBubble =
                  runPosition === "last" || runPosition === "single";
                if (isMe && !isChatMessageRowDeleted(msg) && showReceiptOnBubble) {
                  if (receiptTargetIds != null) {
                    const readOk = isMessageReadByTargets(
                      msg.id,
                      lastReadByUserId,
                      receiptTargetIds
                    );
                    receiptLine = readOk ? "Sent · Read" : "Sent";
                  } else {
                    receiptLine = "Sent";
                  }
                }

                const showReplyAction =
                  !isChatMessageRowDeleted(msg) && Boolean(user?.id);
                const showEditDelete =
                  isMe && !isChatMessageRowDeleted(msg) && Boolean(user?.id);
                const authorRole = authorAssignedAs(authorId);
                const showModDelete =
                  !isMe &&
                  canModerate &&
                  !isChatMessageRowDeleted(msg) &&
                  authorRole === "student";

                return (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    isMe={isMe}
                    runPosition={runPosition}
                    showAuthorLabel={showAuthorLabel}
                    showAvatarColumn={showAvatarColumn}
                    avatarUrl={avatarUrl}
                    receiptLine={receiptLine}
                    onReply={() => beginReply(msg)}
                    onEdit={() => startEditingMessage(msg)}
                    onDelete={() => setDeleteDialog({ kind: "self", msg })}
                    onModDelete={
                      showModDelete
                        ? () => setDeleteDialog({ kind: "mod", msg })
                        : undefined
                    }
                    showReplyAction={showReplyAction}
                    showEditDelete={showEditDelete}
                    showModDelete={showModDelete}
                    canReact={showReplyAction}
                    onReactionToggle={(emoji) => {
                      void handleReactionToggle(msg.id, emoji);
                    }}
                  />
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Fixed height: typing text swaps in without shifting scroll or composer */}
        <div
          className="shrink-0 h-5 px-4 flex items-center"
          aria-live="polite"
        >
          {typingLine ? (
            <p className="text-muted-foreground text-xs truncate w-full">
              {typingLine}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 px-4 py-3 border-t">
          {(error || composerError) && (
            <p className="text-destructive text-xs mb-2 text-center">
              {error ?? composerError}
            </p>
          )}
          {!isLoading && !error && !isConnected && (
            <p className="text-muted-foreground text-xs mb-2 text-center">
              Connecting…
            </p>
          )}
          {editTarget ? (
            <div className="flex items-start gap-2 mb-2 px-1 py-1.5 rounded-lg border border-primary/20 bg-primary/5 text-sm">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground">Editing message</p>
                <p className="text-xs truncate text-foreground/90">
                  {editTargetPreview}
                </p>
              </div>
              <button
                type="button"
                className="p-1 rounded-md hover:bg-muted shrink-0"
                aria-label="Cancel edit"
                onClick={cancelEdit}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}
          {replyTarget ? (
            <div className="flex items-start gap-2 mb-2 px-1 py-1.5 rounded-lg bg-muted/50 border text-sm">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground">
                  Replying to {replyTargetLabel}
                </p>
                <p className="text-xs truncate text-foreground/90">
                  {(replyTarget.content?.text ?? "").slice(0, 120)}
                  {(replyTarget.content?.text ?? "").length > 120 ? "…" : ""}
                </p>
              </div>
              <button
                type="button"
                className="p-1 rounded-md hover:bg-muted shrink-0"
                aria-label="Cancel reply"
                onClick={() => setReplyTarget(null)}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}
          {selectedFiles.length > 0 ? (
            <div className="mb-2 flex items-center gap-2 overflow-x-auto rounded-xl border bg-muted/30 px-2 py-1.5">
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex max-w-[220px] items-center gap-1.5 rounded-lg bg-background/80 px-2 py-1 text-xs"
                >
                  <Attachment className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{file.name}</span>
                  {isUploadingAttachments ? (
                    <span className="shrink-0 text-muted-foreground">
                      Uploading
                    </span>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Remove selected attachments"
                disabled={isUploadingAttachments}
                onClick={() => {
                  setSelectedFiles([]);
                }}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}
          <div {...(recordingContainerProps ?? {})}>
          {isVoiceRecording ? (
            <VoiceRecordingOverlay
              status={voiceRecordingStatus}
              durationMs={voiceDurationMs}
            />
          ) : null}
          <div className="flex items-center gap-2 rounded-2xl border bg-muted/30 px-3 py-2">
            {!isVoiceRecording ? (
            <label className="p-1.5 rounded-full hover:bg-muted/50 transition-colors cursor-pointer">
              <Attachment className="h-5 w-5" aria-hidden />
              <input
                type="file"
                className="hidden"
                multiple
                accept={CHAT_ATTACHMENT_FILE_INPUT_ACCEPT}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  const maxBytes = 15 * 1024 * 1024;
                  const bad = files.find((f) => f.size > maxBytes);
                  if (bad) {
                    setComposerError(`"${bad.name}" is larger than 15 MB.`);
                    e.target.value = "";
                    return;
                  }
                  setComposerError(null);
                  setSelectedFiles((prev) => [...prev, ...files]);
                  e.target.value = "";
                }}
              />
            </label>
            ) : null}
            {!isVoiceRecording ? (
            <Popover.Root open={emojiOpen} onOpenChange={setEmojiOpen}>
              <Popover.Trigger
                render={
                  <button
                    type="button"
                    className="p-1.5 rounded-full hover:bg-muted/50 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label="Add emoji"
                  />
                }
              >
                <Emoji className="h-5 w-5" aria-hidden />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner side="top" align="start">
                  <Popover.Popup className="w-auto p-0 border-0 bg-transparent shadow-none">
                    <EmojiPicker
                      theme={Theme.AUTO}
                      onEmojiClick={(data) => {
                        editableInputRef.current?.insertText(data.emoji);
                        setEmojiOpen(false);
                      }}
                      width={320}
                      height={400}
                    />
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
            ) : null}
            {!isVoiceRecording ? (
            <div className="relative flex-1 min-w-0">
              {mentionPicker.open && mentionChoices.length > 0 ? (
                <ul
                  className="absolute bottom-full left-0 right-0 z-dropdown mb-1 max-h-40 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                  role="listbox"
                  aria-label="Mention a course member"
                >
                  {mentionChoices.map((m, i) => (
                    <li key={m.userId} role="none">
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === mentionHl}
                        className={cn(
                          "flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                          i === mentionHl && "bg-accent text-accent-foreground"
                        )}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyMentionPick(m)}
                      >
                        <span className="font-medium leading-tight truncate">
                          {m.name}
                        </span>
                        {m.email ? (
                          <span className="text-xs text-muted-foreground truncate">
                            {m.email}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ContentEditableInput
                className="min-w-0 text-sm"
                placeholder={editTarget ? "Edit message…" : "Message…"}
                onSubmit={handleSendMessage}
                onContentChange={onComposerInput}
                onKeyDown={handleComposerKeyDown}
                onKeyUp={composerKeyUp}
                onPaste={handleComposerPaste}
                ref={editableInputRef}
              />
            </div>
            ) : (
              <div className="min-w-0 flex-1" aria-hidden />
            )}
            {showVoiceMic || isVoiceRecording ? (
              <VoiceRecordButton
                status={voiceRecordingStatus}
                disabled={isUploadingAttachments || isSendingVoice}
                isLoading={isSendingVoice}
                micButtonProps={micButtonProps}
              />
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-8 w-8 shrink-0 rounded-full"
                onClick={() => {
                  void handleSendMessage(editableInputRef.current?.getText() ?? "");
                }}
                aria-label={editTarget ? "Save edit" : "Send message"}
                isLoading={isUploadingAttachments}
                disabled={!canSend}
              >
                {editTarget ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
              </Button>
            )}
          </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ChatSection;
