"use client";
import { AlertDialog, Avatar, Button, Menu, Popover, Skeleton, useToast } from "@/components/primitives";

import ContentEditableInput, {
  type ContentEditableHandle,
} from "@/components/course/chat/content-editable-input";
import PendingMessageBubble from "@/components/course/chat/pending-message-bubble";
import {
  MessageReactionChips,
  MessageReactionStrip,
  MessageReactButton,
  useMessageReactionPicker,
} from "@/components/chat/message-reactions";
import { ChatAttachmentRenderer } from "@/components/course/chat/chat-attachment-renderer";
import {
  dmThreadsQueryKey,
  fetchDmThreads,
  fetchGroupThreads,
  groupThreadsQueryKey,
  startDmConversation,
  deleteThreadMessage,
  patchThreadMessage,
} from "@/lib/chat-threads/chat-threads-api";
import {
  chatThreadMessagesQueryKey,
  sortChatMessages,
} from "@/lib/chat-threads/chat-messages-query";
import { deriveOtherParticipant } from "@/lib/chat-threads/derive-dm-participant";
import { mergeChatMessagePatchIntoList } from "@/lib/course-chat-merge";
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
import { useHydratedChatMessages } from "@/lib/chat/use-hydrated-chat-messages";
import { cn } from "@/lib/utils";
import { emojify } from "@/lib/emoji";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { useChatThread } from "@/hooks/useChatThread";
import { useUser } from "@/hooks/useUser";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatAttachmentRef,
  ChatMessage,
  ChatMessageContent,
  DmEligibleUser,
} from "@/types/chat";
import { isChatMessageRowDeleted } from "@/lib/chat-message-deleted";
import {
  lookupReplyPreviewForOutbox,
  replyPreviewFromRef,
  type ReplyPreviewLabels,
} from "@/lib/chat/reply-preview";
import { NavArrowLeft as ArrowLeft, Expand as Maximize2, MoreHoriz as MoreHorizontal, EditPencil as Pencil, Attachment as Paperclip, Reply, Send, Emoji as SmilePlus, Trash as Trash2, Xmark as X, Check } from "iconoir-react";
import { dmChatCopy } from "@/messages/dm-chat";
import { groupChatSenderDisplayName } from "@/lib/chat/group-chat-sender-display-name";

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
  return msg.user as number;
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

const replyPreviewLabels: ReplyPreviewLabels = {
  messageDeleted: dmChatCopy.messageDeleted,
  messageFallback: dmChatCopy.replyPreviewFallback,
  unknownUser: dmChatCopy.unknownUserLabel,
};

const MessageBubbleRow = ({
  msg,
  isMe,
  runPosition,
  showAuthorLabel,
  avatarUrl,
  onEdit,
  onDelete,
  onReply,
  showReplyAction,
  onReactionToggle,
  canReact,
  displayAuthorName,
  resolveAuthorName,
}: {
  msg: ChatMessage;
  isMe: boolean;
  runPosition: RunPosition;
  showAuthorLabel: boolean;
  avatarUrl?: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onReply: () => void;
  showReplyAction: boolean;
  onReactionToggle: (emoji: string) => void;
  canReact: boolean;
  displayAuthorName?: string;
  resolveAuthorName?: (authorId: number, defaultName: string) => string;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    open: reactionOpen,
    setOpen: setReactionOpen,
    rootRef: reactionRootRef,
  } = useMessageReactionPicker();
  const u = typeof msg.user === "object" ? msg.user : null;
  const name = displayAuthorName ?? u?.name ?? dmChatCopy.unknownUserLabel;
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
    if (isDeleted)
      return (
        <span className="italic text-muted-foreground">
          {dmChatCopy.messageDeleted}
        </span>
      );
    return emojify(msg.content?.text ?? "");
  };
  const attachments = msg.content?.attachments ?? [];
  const replyPrev = msg.reply_to
    ? (() => {
        const base = replyPreviewFromRef(msg.reply_to, replyPreviewLabels);
        const replyUser =
          typeof msg.reply_to?.user === "object" ? msg.reply_to.user : null;
        if (resolveAuthorName && replyUser) {
          return {
            ...base,
            name: resolveAuthorName(replyUser.id, base.name),
          };
        }
        return base;
      })()
    : null;
  const showMessageMenu = isMe && !isDeleted;
  const hasMenu = showReplyAction || showMessageMenu;
  const showActions = canReact || hasMenu;

  return (
    <div
      className={cn(
        "flex gap-2 items-end max-w-[85%] group/msg relative",
        isMe ? "flex-row-reverse ml-auto" : "flex-row",
        marginClass
      )}
    >
      {isMe ? null : (
        <Avatar className="w-7 h-7 shrink-0 rounded-full" src={avatarUrl ?? undefined} name={initials} />
      )}
      <div
        className={cn(
          "flex flex-col min-w-0",
          isMe ? "items-end" : "items-start"
        )}
      >
        {showAuthorLabel ? (
          <span className="text-[11px] text-muted-foreground mb-0.5 truncate max-w-[180px]">
            {isMe ? dmChatCopy.youLabel : name}
          </span>
        ) : null}
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
            {replyPrev ? (
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
            ) : null}
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
                <Menu.Trigger render={<button
                    type="button"
                    className="p-1 rounded-full text-foreground/55 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={dmChatCopy.messageActionsAria}
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </button>} />
                <Menu.Portal>
        <Menu.Positioner
                  side="left"
                  align="start"
                  sideOffset={4}
                  collisionPadding={8}
                >
        <Menu.Popup
                  className="w-44 z-dropdown"
                >
                  {showReplyAction ? (
                    <Menu.Item
                      className="gap-2"
                      onSelect={() => {
                        onReply();
                      }}
                    >
                      <Reply className="h-4 w-4 shrink-0" aria-hidden />
                      {dmChatCopy.replyMenu}
                    </Menu.Item>
                  ) : null}
                  {showMessageMenu ? (
                  <>
                  <Menu.Item
                    className="gap-2"
                    onSelect={() => {
                      onEdit();
                    }}
                  >
                    <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                    {dmChatCopy.editMenu}
                  </Menu.Item>
                  <Menu.Item
                    className="gap-2 text-destructive focus:text-destructive"
                    onSelect={() => {
                      onDelete();
                    }}
                  >
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                    {dmChatCopy.deleteMenu}
                  </Menu.Item>
                  </>
                  ) : null}
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
      </div>
    </div>
  );
};

type Props = {
  threadId?: number;
  otherParticipant?: DmEligibleUser | null;
  threadKind?: "dm" | "group";
  groupDisplayTitle?: string;
  layout?: "panel" | "page";
  onExpand?: () => void;
  handleChatListsClose: () => void;
  handleChatSectionBack: () => void;
};

export default function DmSection({
  threadId: threadIdProp,
  otherParticipant,
  threadKind: threadKindProp = "dm",
  groupDisplayTitle,
  layout = "panel",
  onExpand,
  handleChatListsClose,
  handleChatSectionBack,
}: Props) {
  const [activeThreadId, setActiveThreadId] = useState<number | null>(
    threadIdProp ?? null
  );
  const [isStartingConversation, setIsStartingConversation] = useState(false);

  useEffect(() => {
    if (threadIdProp != null) {
      setActiveThreadId(threadIdProp);
    }
  }, [threadIdProp]);

  const isDraftMode =
    threadKindProp === "dm" &&
    activeThreadId == null &&
    Boolean(otherParticipant && otherParticipant.id);
  const editableInputRef = useRef<ContentEditableHandle | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { user } = useUser();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [deleteDialogMsg, setDeleteDialogMsg] = useState<ChatMessage | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);

  const { data: groupThreadsData } = useQuery({
    queryKey: groupThreadsQueryKey(user?.id),
    queryFn: fetchGroupThreads,
    enabled: Boolean(user?.id) && threadKindProp === "group",
    refetchOnWindowFocus: false,
  });

  const activeGroupThread = useMemo(() => {
    if (threadKindProp !== "group" || activeThreadId == null) return undefined;
    return (groupThreadsData ?? []).find((t) => t.id === activeThreadId);
  }, [activeThreadId, groupThreadsData, threadKindProp]);

  const resolveGroupAuthorName = useCallback(
    (authorId: number, defaultName: string) => {
      if (!user || threadKindProp !== "group") return defaultName;
      return groupChatSenderDisplayName({
        viewer: user,
        authorUserId: authorId,
        authorNameFromMessage: defaultName,
        participants: activeGroupThread?.participants,
        anchorUserId: activeGroupThread?.anchor_user_id,
        teacherLabel: dmChatCopy.teacherSenderLabel,
      });
    },
    [activeGroupThread, threadKindProp, user],
  );

  const threadsQk = dmThreadsQueryKey(user?.id);
  const { data: dmThreadsData } = useQuery({
    queryKey: threadsQk,
    queryFn: fetchDmThreads,
    enabled: Boolean(user?.id),
    refetchOnWindowFocus: false,
  });

  const peer = useMemo((): DmEligibleUser => {
    if (otherParticipant && otherParticipant.id) return otherParticipant;
    const threads = dmThreadsData ?? [];
    const fromList = threads.find((t) => t.id === activeThreadId);
    const derived = fromList
      ? deriveOtherParticipant(fromList, user?.id)
      : null;
    if (derived && derived.id) return derived;
    return {
      id: 0,
      name: dmChatCopy.unknownUserLabel,
      email: "",
      profile_image: null,
    };
  }, [dmThreadsData, otherParticipant, activeThreadId]);

  const peerTitle =
    threadKindProp === "group" && groupDisplayTitle
      ? groupDisplayTitle
      : peer.name?.trim() || peer.email?.trim() || dmChatCopy.directMessageSubtitle;
  const peerInitials = (peerTitle || "DM").slice(0, 2).toUpperCase();

  const {
    messages,
    outbox,
    retryOutbox,
    isLoading,
    error,
    isConnected,
    sendMessage,
    putReadCursor,
    toggleReaction,
  } = useChatThread(activeThreadId, threadKindProp);

  const handleReactionToggle = useCallback(
    async (messageId: number, emoji: string) => {
      try {
        await toggleReaction(messageId, emoji);
      } catch {
        toast.add({
          title: "Could not update reaction",
          description: "Please try again.",
          type: "error",
        });
      }
    },
    [toggleReaction, toast]
  );

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

  const timelineItems = useMemo(
    () => buildChatTimeline(timelineInputs, formatDate, formatTime),
    [timelineInputs, formatDate, formatTime]
  );

  const handleVoiceRecordingComplete = useCallback(
    async (
      file: File | null,
      reason: "sent" | "cancelled" | "too_short"
    ) => {
      if (reason === "too_short") {
        toast.add({ description: chatComposerCopy.recordingTooShort });
        return;
      }
      if (!file || activeThreadId == null) return;

      setIsSendingVoice(true);
      try {
        await sendVoiceAttachment(
          file,
          String(activeThreadId),
          sendMessage,
          replyTarget?.id
        );
        setReplyTarget(null);
      } catch {
        setComposerError(dmChatCopy.uploadFailed);
      } finally {
        setIsSendingVoice(false);
      }
    },
    [activeThreadId, replyTarget?.id, sendMessage, toast]
  );

  const {
    status: voiceRecordingStatus,
    durationMs: voiceDurationMs,
    isRecording: isVoiceRecording,
    isSupported: isVoiceRecordingSupported,
    micButtonProps,
    recordingContainerProps,
  } = useVoiceRecorder({
    disabled:
      isUploadingAttachments ||
      isSendingVoice ||
      isDraftMode ||
      activeThreadId == null,
    onPermissionDenied: () => {
      toast.add({
        type: "error",
        description: chatComposerCopy.micPermissionDenied,
      });
    },
    onRecordingComplete: (file, reason) => {
      void handleVoiceRecordingComplete(file, reason);
    },
  });

  const showVoiceMic =
    isVoiceRecordingSupported &&
    !isDraftMode &&
    activeThreadId != null &&
    composerText.trim().length === 0 &&
    selectedFiles.length === 0 &&
    !editTarget;

  const canSend =
    !isUploadingAttachments &&
    !isSendingVoice &&
    !isStartingConversation &&
    voiceRecordingStatus === "idle" &&
    (composerText.trim().length > 0 ||
      (!isDraftMode && selectedFiles.length > 0));

  const patchMessage = async (messageId: number, content: ChatMessageContent) => {
    if (activeThreadId == null) return;
    const row = await patchThreadMessage(activeThreadId, messageId, {
      text: content.text,
      mentions: [...(content.mentions ?? [])],
      attachments: [...(content.attachments ?? [])],
    });
    queryClient.setQueryData<ChatMessage[]>(
      chatThreadMessagesQueryKey(activeThreadId),
      (prev) => {
        const base = prev ?? [];
        const next = mergeChatMessagePatchIntoList(base, row);
        return sortChatMessages(next);
      }
    );
    void queryClient.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === "chat-threads" && q.queryKey[1] === "dm",
    });
  };

  const deleteMessageById = async (messageId: number) => {
    if (activeThreadId == null) return;
    const messagesKey = chatThreadMessagesQueryKey(activeThreadId);
    const listBefore = queryClient.getQueryData<ChatMessage[]>(messagesKey) ?? [];
    const prevRow = listBefore.find((m) => m.id === messageId);
    const rolledBack =
      prevRow !== undefined
        ? (structuredClone(prevRow) as ChatMessage)
        : undefined;

    queryClient.setQueryData<ChatMessage[]>(messagesKey, (prev) =>
      applyOptimisticDeleteToMessageList(prev ?? [], messageId, {
        deleted_at: new Date().toISOString(),
        deleted_by_id: null,
      })
    );

    if (editTarget?.id === messageId) {
      setEditTarget(null);
      editableInputRef.current?.clear();
      setComposerText("");
    }
    if (replyTarget?.id === messageId) {
      setReplyTarget(null);
    }

    try {
      const row = await deleteThreadMessage(activeThreadId, messageId);
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
    void queryClient.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === "chat-threads" && q.queryKey[1] === "dm",
    });
  };

  const cancelEdit = useCallback(() => {
    setEditTarget(null);
    editableInputRef.current?.clear();
    setComposerText("");
  }, []);

  const cancelReply = useCallback(() => {
    setReplyTarget(null);
  }, []);

  const beginReply = useCallback((msg: ChatMessage) => {
    setEditTarget(null);
    editableInputRef.current?.clear();
    setComposerText("");
    setReplyTarget(msg);
    queueMicrotask(() => editableInputRef.current?.focus());
  }, []);

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
        setComposerError(dmChatCopy.uploadTooLarge.replace("{name}", bad.name));
        return;
      }
      setComposerError(null);
      setSelectedFiles((prev) => [...prev, ...files]);
    },
    []
  );

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
    cancelEdit();
    cancelReply();
    setComposerError(null);
    setSelectedFiles([]);
    setEmojiOpen(false);
    const t = setTimeout(() => editableInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [activeThreadId, cancelEdit, cancelReply]);

  const handleSendMessage = async (text: string) => {
    const trimmed = text?.trim();
    if (!trimmed && selectedFiles.length === 0) return;
    setComposerError(null);
    const withEmoji = emojify(trimmed);

    if (isDraftMode && otherParticipant?.id) {
      if (!trimmed) return;
      setIsStartingConversation(true);
      try {
        const { thread, message } = await startDmConversation(
          otherParticipant.id,
          {
            text: withEmoji,
            mentions: [],
            attachments: [],
          }
        );
        setActiveThreadId(thread.id);
        queryClient.setQueryData(
          chatThreadMessagesQueryKey(thread.id),
          sortChatMessages([message])
        );
        void queryClient.invalidateQueries({
          queryKey: dmThreadsQueryKey(user?.id),
        });
        setReplyTarget(null);
        setEmojiOpen(false);
        setSelectedFiles([]);
        editableInputRef.current?.clear();
        setComposerText("");
      } catch {
        setComposerError(dmChatCopy.sendFailed);
      } finally {
        setIsStartingConversation(false);
      }
      return;
    }

    if (activeThreadId == null) return;

    let attachmentRefs: ChatAttachmentRef[] = [];
    if (selectedFiles.length > 0) {
      setIsUploadingAttachments(true);
      try {
        attachmentRefs = await uploadChatAttachments(
          selectedFiles,
          String(activeThreadId)
        );
      } catch {
        setComposerError(dmChatCopy.uploadFailed);
        setIsUploadingAttachments(false);
        return;
      } finally {
        setIsUploadingAttachments(false);
      }
    }

    if (editTarget) {
      const editingSession = editTarget;
      const messageId = editingSession.id;
      const messagesKey = chatThreadMessagesQueryKey(activeThreadId);
      const listBefore =
        queryClient.getQueryData<ChatMessage[]>(messagesKey) ?? [];
      const snapshotForRollback = listBefore.find((m) => m.id === messageId);
      const rolledBack =
        snapshotForRollback !== undefined
          ? (structuredClone(snapshotForRollback) as ChatMessage)
          : undefined;

      queryClient.setQueryData<ChatMessage[]>(messagesKey, (prev) =>
        applyOptimisticEditToMessageList(prev ?? [], messageId, {
          text: withEmoji,
          attachments: editTarget.content?.attachments ?? [],
          mentions: [],
        })
      );
      setEditTarget(null);
      editableInputRef.current?.clear();
      setComposerText("");
      try {
        await patchMessage(messageId, {
          text: withEmoji,
          mentions: [],
          attachments: editTarget.content?.attachments ?? [],
        });
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
        setEditTarget(editingSession);
        queueMicrotask(() => {
          editableInputRef.current?.setPlainText(withEmoji);
          setComposerText(withEmoji);
          editableInputRef.current?.focus();
        });
      }
      setSelectedFiles([]);
      return;
    }

    sendMessage(
      {
        text: withEmoji,
        mentions: [],
        attachments: attachmentRefs,
      },
      replyTarget?.id != null ? { replyToId: replyTarget.id } : undefined
    );
    setReplyTarget(null);
    setEmojiOpen(false);
    setSelectedFiles([]);
    editableInputRef.current?.clear();
    setComposerText("");
  };

  const editPreview =
    editTarget?.content?.text && editTarget.content.text.length > 120
      ? `${editTarget.content.text.slice(0, 120)}…`
      : editTarget?.content?.text ?? "";

  const replyTargetLabel = useMemo(() => {
    if (!replyTarget) return "";
    const u = replyTarget.user;
    const defaultName =
      typeof u === "object" && u?.name
        ? u.name
        : dmChatCopy.unknownUserLabel;
    if (typeof u === "object" && u?.id != null) {
      return resolveGroupAuthorName(u.id, defaultName);
    }
    return defaultName;
  }, [replyTarget, resolveGroupAuthorName]);

  const lookupReplyPreviewForOutboxMemo = useCallback(
    (replyToId: number | undefined) => {
      const preview = lookupReplyPreviewForOutbox(
        messages,
        replyToId,
        replyPreviewLabels
      );
      if (!preview || threadKindProp !== "group") return preview;
      const found = messages.find((m) => m.id === replyToId);
      const authorId =
        found && typeof found.user === "object" ? found.user.id : null;
      if (authorId == null) return preview;
      return {
        ...preview,
        authorName: resolveGroupAuthorName(authorId, preview.authorName),
      };
    },
    [messages, resolveGroupAuthorName, threadKindProp]
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <AlertDialog.Root
        open={deleteDialogMsg != null}
        onOpenChange={(open) => {
          if (!open) setDeleteDialogMsg(null);
        }}
      >
        <AlertDialog.Portal>
        <AlertDialog.Backdrop />
        <AlertDialog.Popup>
          <div>
            <AlertDialog.Title>
              {dmChatCopy.messageDeletedConfirmTitle}
            </AlertDialog.Title>
            <AlertDialog.Description>
              {dmChatCopy.messageDeletedConfirmDescription}
            </AlertDialog.Description>
          </div>
          <div>
            <AlertDialog.Close>{dmChatCopy.cancelAction}</AlertDialog.Close>
            <AlertDialog.Close
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const d = deleteDialogMsg;
                setDeleteDialogMsg(null);
                if (d) void deleteMessageById(d.id);
              }}
            >
              {dmChatCopy.deleteAction}
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
          aria-label={dmChatCopy.backToConversations}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <Avatar className="w-9 h-9 shrink-0 rounded-full" src={peer.profile_image ?? undefined} name={peerInitials} />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-sm">{peerTitle}</p>
          <p className="text-xs text-muted-foreground">
            {dmChatCopy.directMessageSubtitle}
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
              aria-label={dmChatCopy.closeChatAria}
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
            <p className="text-sm font-medium text-muted-foreground truncate">
              {peerTitle}
            </p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              {dmChatCopy.privacyNoticeDm}
            </p>
          </div>

          {isLoading && !isDraftMode ? (
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
                  return (
                    <PendingMessageBubble
                      key={`out-${row.item.localId}`}
                      item={row.item}
                      onRetry={retryOutbox}
                      showAuthor={showAuthorLabel}
                      avatarUrl={user?.profile_image ?? null}
                      runPosition={runPosition}
                      hideAvatar
                      webSocketReady={isConnected}
                      replyPreview={
                        row.item.reply_to_id
                          ? lookupReplyPreviewForOutboxMemo(row.item.reply_to_id)
                          : undefined
                      }
                    />
                  );
                }

                const msg = row.msg;
                const isMe =
                  typeof msg.user === "object"
                    ? msg.user.id === user?.id
                    : msg.user === user?.id;
                const authorId = getMessageUserId(msg);
                const defaultAuthorName =
                  typeof msg.user === "object"
                    ? msg.user.name?.trim() || dmChatCopy.unknownUserLabel
                    : dmChatCopy.unknownUserLabel;
                const displayAuthorName =
                  threadKindProp === "group"
                    ? resolveGroupAuthorName(authorId, defaultAuthorName)
                    : undefined;
                const avatarUrl =
                  peer.id === authorId ? peer.profile_image : user?.profile_image;

                const showReplyAction =
                  !isChatMessageRowDeleted(msg) && Boolean(user?.id);

                return (
                  <MessageBubbleRow
                    key={msg.id}
                    msg={msg}
                    isMe={isMe}
                    runPosition={runPosition}
                    showAuthorLabel={showAuthorLabel}
                    avatarUrl={avatarUrl ?? null}
                    displayAuthorName={displayAuthorName}
                    resolveAuthorName={
                      threadKindProp === "group" ? resolveGroupAuthorName : undefined
                    }
                    onEdit={() => {
                      const m = messages.find((x) => x.id === msg.id);
                      if (!m) return;
                      setReplyTarget(null);
                      setEditTarget(m);
                      queueMicrotask(() => {
                        const raw = m.content?.text ?? "";
                        editableInputRef.current?.setPlainText(raw);
                        setComposerText(raw);
                        editableInputRef.current?.focus();
                      });
                    }}
                    onReply={() => beginReply(msg)}
                    showReplyAction={showReplyAction}
                    onDelete={() => setDeleteDialogMsg(msg)}
                    canReact={!isChatMessageRowDeleted(msg) && Boolean(user?.id)}
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

        <div className="shrink-0 px-4 py-3 border-t">
          {(error || composerError) ? (
            <p className="text-destructive text-xs mb-2 text-center">
              {error ?? composerError}
            </p>
          ) : null}
          {!isDraftMode && !isLoading && !error && !isConnected ? (
            <p className="text-muted-foreground text-xs mb-2 text-center">
              {dmChatCopy.connectingHint}
            </p>
          ) : null}
          {editTarget ? (
            <div className="flex items-start gap-2 mb-2 px-1 py-1.5 rounded-lg border border-primary/20 bg-primary/5 text-sm">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground">
                  {dmChatCopy.editBanner}
                </p>
                <p className="text-xs truncate text-foreground/90">{editPreview}</p>
              </div>
              <button
                type="button"
                className="p-1 rounded-md hover:bg-muted shrink-0"
                aria-label={dmChatCopy.cancelEditAria}
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
                  {dmChatCopy.replyBannerPrefix} {replyTargetLabel}
                </p>
                <p className="text-xs truncate text-foreground/90">
                  {(replyTarget.content?.text ?? "").slice(0, 120)}
                  {(replyTarget.content?.text ?? "").length > 120 ? "…" : ""}
                </p>
              </div>
              <button
                type="button"
                className="p-1 rounded-md hover:bg-muted shrink-0"
                aria-label={dmChatCopy.cancelReplyAria}
                onClick={cancelReply}
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
                  <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
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
                aria-label={dmChatCopy.cancelAction}
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
            {!isVoiceRecording && !isDraftMode ? (
            <label className="p-1.5 rounded-full hover:bg-muted/50 transition-colors cursor-pointer">
              <Paperclip className="h-5 w-5" aria-hidden />
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
                    setComposerError(
                      dmChatCopy.uploadTooLarge.replace("{name}", bad.name)
                    );
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
                type="button"
                className="p-1.5 rounded-full hover:bg-muted/50 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={dmChatCopy.addEmoji}
              >
                <SmilePlus className="h-5 w-5" aria-hidden />
              </Popover.Trigger>
              <Popover.Portal>
        <Popover.Positioner side="top" align="start">
        <Popover.Popup
                className="w-auto p-0 border-0 bg-transparent shadow-none"
              >
                <EmojiPicker
                  theme={Theme.AUTO}
                  onEmojiClick={(emojiData) => {
                    editableInputRef.current?.insertText(emojiData.emoji);
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
            <ContentEditableInput
              className="min-w-0 text-sm flex-1"
              placeholder={
                editTarget
                  ? dmChatCopy.composerEditPlaceholder
                  : dmChatCopy.composerPlaceholder
              }
              onSubmit={(t) => {
                void handleSendMessage(t);
              }}
              onContentChange={() => {
                setComposerText(editableInputRef.current?.getText() ?? "");
              }}
              onPaste={handleComposerPaste}
              ref={editableInputRef}
            />
            ) : (
              <div className="min-w-0 flex-1" aria-hidden />
            )}
            {showVoiceMic || isVoiceRecording ? (
              <VoiceRecordButton
                status={voiceRecordingStatus}
                disabled={
                  isUploadingAttachments ||
                  isSendingVoice ||
                  isStartingConversation
                }
                isLoading={isSendingVoice}
                micButtonProps={micButtonProps}
              />
            ) : (
              <Button
                type="button"
                size="sm" className="h-8 w-8 shrink-0 rounded-full"
                onClick={() => {
                  void handleSendMessage(
                    editableInputRef.current?.getText() ?? ""
                  );
                }}
                aria-label={
                  editTarget ? dmChatCopy.saveEdit : dmChatCopy.sendMessage
                }
                isLoading={isUploadingAttachments || isStartingConversation}
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
    </div>
  );
}