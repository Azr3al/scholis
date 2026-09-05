"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCookie } from "cookies-next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChatMessage,
  ChatMessageContent,
  ChatOutboxItem,
} from "@/types/chat";
import { mergeChatMessagePatchIntoList } from "@/lib/course-chat-merge";
import {
  mergeReactionChangedIntoMessages,
  optimisticToggleReaction,
} from "@/lib/chat/chat-reaction-merge";
import { getCurrentUserIdFromCookie } from "@/lib/chat/get-current-user-id";
import {
  putThreadReadCursor,
  toggleThreadReaction,
} from "@/lib/chat-threads/chat-threads-api";
import {
  chatThreadMessagesQueryKey,
  fetchThreadMessages,
  CHAT_THREAD_MESSAGES_CACHE_TIME_MS,
  CHAT_THREAD_MESSAGES_STALE_MS,
  sortChatMessages,
} from "@/lib/chat-threads/chat-messages-query";

export type ChatThreadKind = "course" | "dm" | "group";

const getWsBaseUrl = () => {
  const base = process.env.NEXT_PUBLIC_BASE_API_URL || "";
  try {
    const url = new URL(base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = url.pathname.replace(/\/api\/v1\/?$/, "");
    return `${url.origin}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return "";
  }
};

function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function isWsSideEvent(data: Record<string, unknown>): boolean {
  return "event" in data && typeof (data as { event?: unknown }).event === "string";
}

function contentForSend(content: ChatMessageContent): ChatMessageContent {
  return {
    ...content,
    attachments: content.attachments?.map((att) => ({
      attachment_id: att.attachment_id,
      name: att.name,
      mime_type: att.mime_type,
      size_bytes: att.size_bytes,
    })),
  };
}

export function useChatThread(
  threadId: number | null,
  kind: ChatThreadKind
) {
  const isCourse = kind === "course";
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number>(0);
  const [sessionOrMembershipError, setSessionOrMembershipError] = useState<
    string | null
  >(null);
  const [wsTransientError, setWsTransientError] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<ChatOutboxItem[]>([]);
  const [lastReadByUserId, setLastReadByUserId] = useState<Record<number, number>>(
    {}
  );
  const [typingPeers, setTypingPeers] = useState<
    Map<number, { name: string; expires: number }>
  >(() => new Map());

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const lastDispatchedLocalIdRef = useRef<string | null>(null);
  const suppressWsTransientErrorRef = useRef(true);
  const typingTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const dispatchedOutboxLocalIdsRef = useRef<Set<string>>(new Set());

  const invalidateDmThreadLists = useCallback(() => {
    if (isCourse) return;
    void queryClient.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === "chat-threads" && q.queryKey[1] === "dm",
    });
  }, [isCourse, queryClient]);

  const {
    data: messages = [],
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: threadId
      ? chatThreadMessagesQueryKey(threadId)
      : ["chat-thread-messages", "disabled"],
    queryFn: () => fetchThreadMessages(threadId as number),
    enabled: Boolean(threadId),
    staleTime: CHAT_THREAD_MESSAGES_STALE_MS,
    cacheTime: CHAT_THREAD_MESSAGES_CACHE_TIME_MS,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    suppressWsTransientErrorRef.current = isHistoryLoading;
  }, [isHistoryLoading]);

  const removeOutboxByClientId = useCallback((id: string) => {
    dispatchedOutboxLocalIdsRef.current.delete(id);
    setOutbox((prev) => prev.filter((x) => x.localId !== id));
  }, []);

  const flushOutbox = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setOutbox((prev) => {
      const pending = prev.filter((x) => x.status === "pending");
      if (pending.length === 0) return prev;
      for (const item of pending) {
        const payload: Record<string, unknown> = {
          content: contentForSend(item.content),
          client_message_id: item.localId,
        };
        if (item.reply_to_id != null) {
          payload.reply_to_id = item.reply_to_id;
        }
        const alreadySent = dispatchedOutboxLocalIdsRef.current.has(
          item.localId
        );
        if (!alreadySent) {
          dispatchedOutboxLocalIdsRef.current.add(item.localId);
          lastDispatchedLocalIdRef.current = item.localId;
          ws.send(JSON.stringify(payload));
        }
      }
      return prev.map((x) =>
        x.status === "pending" ? { ...x, status: "sending" as const } : x
      );
    });
  }, []);

  const retryOutbox = useCallback(
    (localId: string) => {
      dispatchedOutboxLocalIdsRef.current.delete(localId);
      setOutbox((prev) =>
        prev.map((x) =>
          x.localId === localId
            ? { ...x, status: "pending" as const, error: undefined }
            : x
        )
      );
      queueMicrotask(() => {
        flushOutbox();
      });
    },
    [flushOutbox]
  );

  const addMessage = useCallback(
    (msg: ChatMessage) => {
      if (!threadId) return;
      queryClient.setQueryData<ChatMessage[]>(
        chatThreadMessagesQueryKey(threadId),
        (prev) => {
          const base = prev ?? [];
          if (base.some((m) => m.id === msg.id)) return base;
          return sortChatMessages([...base, msg]);
        }
      );
      invalidateDmThreadLists();
    },
    [threadId, queryClient, invalidateDmThreadLists]
  );

  const applyMessageEdited = useCallback(
    (edited: Partial<ChatMessage> & { id: number }) => {
      if (!threadId) return;
      queryClient.setQueryData<ChatMessage[]>(
        chatThreadMessagesQueryKey(threadId),
        (prev) => {
          const base = prev ?? [];
          const next = mergeChatMessagePatchIntoList(base, edited);
          return sortChatMessages(next);
        }
      );
      invalidateDmThreadLists();
    },
    [threadId, queryClient, invalidateDmThreadLists]
  );

  const applyMessageDeleted = useCallback(
    (tombstone: {
      id: number;
      deleted_at: string;
      deleted_by_id?: number | null;
    }) => {
      if (!threadId) return;
      queryClient.setQueryData<ChatMessage[]>(
        chatThreadMessagesQueryKey(threadId),
        (prev) => {
          const base = prev ?? [];
          return base.map((m) =>
            m.id === tombstone.id
              ? {
                  ...m,
                  deleted_at: tombstone.deleted_at,
                  deleted_by_id:
                    tombstone.deleted_by_id === undefined
                      ? null
                      : tombstone.deleted_by_id,
                  content: { text: "", mentions: [], attachments: [] },
                  reactions: [],
                }
              : m
          );
        }
      );
      invalidateDmThreadLists();
    },
    [threadId, queryClient, invalidateDmThreadLists]
  );

  const applyReactionChanged = useCallback(
    (payload: { message_id: number; reactions: ChatMessage["reactions"] }) => {
      if (!threadId) return;
      queryClient.setQueryData<ChatMessage[]>(
        chatThreadMessagesQueryKey(threadId),
        (prev) => {
          const base = prev ?? [];
          return mergeReactionChangedIntoMessages(base, {
            message_id: payload.message_id,
            reactions: payload.reactions ?? [],
          });
        }
      );
    },
    [threadId, queryClient]
  );

  const handleTypingPayload = useCallback(
    (payload: { user_id: number; name: string; typing: boolean }) => {
      const userId = payload.user_id;
      const prevTimer = typingTimeoutsRef.current.get(userId);
      if (prevTimer) {
        clearTimeout(prevTimer);
        typingTimeoutsRef.current.delete(userId);
      }
      if (!payload.typing) {
        setTypingPeers((prev) => {
          if (!prev.has(userId)) return prev;
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
        return;
      }
      setTypingPeers((prev) => {
        const next = new Map(prev);
        next.set(userId, {
          name: payload.name ?? "",
          expires: Date.now() + 5000,
        });
        return next;
      });
      const t = setTimeout(() => {
        setTypingPeers((prev) => {
          if (!prev.has(userId)) return prev;
          const n = new Map(prev);
          n.delete(userId);
          return n;
        });
        typingTimeoutsRef.current.delete(userId);
      }, 5000);
      typingTimeoutsRef.current.set(userId, t);
    },
    []
  );

  const connect = useCallback(() => {
    if (!threadId) return;
    const token = getCookie("access");
    const schema = getCookie("schema");
    if (!token || !schema) return;

    const wsBase = getWsBaseUrl();
    if (!wsBase) {
      setWsTransientError(
        "Chat WebSocket misconfigured: NEXT_PUBLIC_BASE_API_URL must be a full URL (e.g. http://127.0.0.1:8000/api/v1)."
      );
      return;
    }
    const wsUrl = `${wsBase}/ws/chat/threads/${threadId}/?token=${encodeURIComponent(
      String(token)
    )}&tenant=${encodeURIComponent(String(schema))}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setWsTransientError(null);
        reconnectAttempts.current = 0;
        flushOutbox();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as Record<string, unknown>;
          if (data.error) {
            if (data.error === "rate_limited" && isCourse) {
              const retrySec =
                typeof data.retry_after_seconds === "number"
                  ? data.retry_after_seconds
                  : 45;
              setRateLimitedUntil(Date.now() + retrySec * 1000);
              const id = lastDispatchedLocalIdRef.current;
              if (id) {
                dispatchedOutboxLocalIdsRef.current.delete(id);
                setOutbox((prev) =>
                  prev.map((x) =>
                    x.localId === id
                      ? {
                          ...x,
                          status: "failed",
                          error: "Slow down — try again in a moment.",
                        }
                      : x
                  )
                );
                lastDispatchedLocalIdRef.current = null;
              }
            } else if (
              !isCourse &&
              typeof data.error === "string"
            ) {
              const id =
                typeof data.client_message_id === "string"
                  ? data.client_message_id
                  : undefined;
              if (id) {
                dispatchedOutboxLocalIdsRef.current.delete(id);
                setOutbox((prev) =>
                  prev.map((x) =>
                    x.localId === id
                      ? { ...x, status: "failed", error: data.error as string }
                      : x
                  )
                );
              }
            }
            return;
          }

          if (isWsSideEvent(data)) {
            const ev = (data as { event: string }).event;
            switch (ev) {
              case "message_edited": {
                const row = (data as { data?: Partial<ChatMessage> & { id: number } })
                  .data;
                if (row && typeof row.id === "number") {
                  applyMessageEdited(row);
                }
                return;
              }
              case "message_deleted": {
                const tomb = (data as {
                  data?: {
                    id: number;
                    deleted_at: string;
                    deleted_by_id?: number | null;
                  };
                }).data;
                if (
                  tomb &&
                  typeof tomb.id === "number" &&
                  typeof tomb.deleted_at === "string"
                ) {
                  applyMessageDeleted(tomb);
                }
                return;
              }
              case "typing": {
                if (!isCourse) return;
                const user_id = (data as { user_id?: unknown }).user_id;
                const name = String((data as { name?: unknown }).name ?? "");
                const typing = Boolean((data as { typing?: unknown }).typing);
                if (typeof user_id === "number") {
                  handleTypingPayload({ user_id, name, typing });
                }
                return;
              }
              case "read_receipt": {
                if (!isCourse) return;
                const user_id = (data as { user_id?: unknown }).user_id;
                const last_read = (data as { last_read_message_id?: unknown })
                  .last_read_message_id;
                if (
                  typeof user_id === "number" &&
                  typeof last_read === "number"
                ) {
                  setLastReadByUserId((prev) => ({
                    ...prev,
                    [user_id]: last_read,
                  }));
                }
                return;
              }
              case "reaction_changed": {
                const row = (data as {
                  data?: {
                    message_id?: unknown;
                    reactions?: ChatMessage["reactions"];
                  };
                }).data;
                if (row && typeof row.message_id === "number") {
                  applyReactionChanged({
                    message_id: row.message_id,
                    reactions: row.reactions ?? [],
                  });
                }
                return;
              }
              default:
                return;
            }
          }

          const cmid =
            typeof data.client_message_id === "string"
              ? data.client_message_id
              : undefined;
          if (cmid) {
            removeOutboxByClientId(cmid);
          }
          addMessage(data as ChatMessage);
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = (e) => {
        setIsConnected(false);
        wsRef.current = null;
        if (e.code === 4002) {
          setSessionOrMembershipError("Session expired. Please refresh.");
          setOutbox([]);
          return;
        }
        if (e.code === 4003) {
          setSessionOrMembershipError(
            isCourse
              ? "You are not a member of this course."
              : "You do not have access to this conversation."
          );
          setOutbox([]);
          return;
        }
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
        reconnectAttempts.current += 1;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        if (suppressWsTransientErrorRef.current) return;
        setWsTransientError("Connection error");
      };
    } catch {
      if (!suppressWsTransientErrorRef.current) {
        setWsTransientError("Failed to connect");
      }
    }
  }, [
    threadId,
    isCourse,
    addMessage,
    flushOutbox,
    removeOutboxByClientId,
    applyMessageEdited,
    applyMessageDeleted,
    handleTypingPayload,
    applyReactionChanged,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback(
    (content: ChatMessageContent, options?: { replyToId?: number }) => {
      const localId = newLocalId();
      const reply_to_id = options?.replyToId;
      const ws = wsRef.current;

      const payload: Record<string, unknown> = {
        content: contentForSend(content),
        client_message_id: localId,
      };
      if (reply_to_id != null) {
        payload.reply_to_id = reply_to_id;
      }

      let sentSynchronously = false;
      if (ws?.readyState === WebSocket.OPEN) {
        if (!dispatchedOutboxLocalIdsRef.current.has(localId)) {
          dispatchedOutboxLocalIdsRef.current.add(localId);
          lastDispatchedLocalIdRef.current = localId;
          ws.send(JSON.stringify(payload));
          sentSynchronously = true;
        }
      }

      setOutbox((prev) => [
        ...prev,
        {
          localId,
          content,
          createdAt: Date.now(),
          status: sentSynchronously ? "sending" : "pending",
          ...(reply_to_id != null ? { reply_to_id } : {}),
        },
      ]);

      if (!sentSynchronously) {
        queueMicrotask(() => {
          flushOutbox();
        });
      }
    },
    [flushOutbox]
  );

  const sendTyping = useCallback(
    (active: boolean) => {
      if (!isCourse) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "typing", typing: active }));
    },
    [isCourse]
  );

  const putReadCursor = useCallback(
    async (messageId: number) => {
      if (!threadId) return;
      await putThreadReadCursor(threadId, messageId);
      invalidateDmThreadLists();
    },
    [threadId, invalidateDmThreadLists]
  );

  const toggleReaction = useCallback(
    async (messageId: number, emoji: string) => {
      if (!threadId) return;
      const key = chatThreadMessagesQueryKey(threadId);
      const snapshot = queryClient.getQueryData<ChatMessage[]>(key);
      const currentUserId = getCurrentUserIdFromCookie();
      queryClient.setQueryData<ChatMessage[]>(key, (prev) =>
        optimisticToggleReaction(
          prev ?? [],
          messageId,
          emoji,
          currentUserId
        )
      );
      try {
        const result = await toggleThreadReaction(threadId, messageId, emoji);
        applyReactionChanged({
          message_id: result.message_id,
          reactions: result.reactions,
        });
      } catch {
        if (snapshot) queryClient.setQueryData(key, snapshot);
        throw new Error("reaction_failed");
      }
    },
    [threadId, queryClient, applyReactionChanged]
  );

  useEffect(() => {
    if (!isConnected || !isCourse) return;
    const id = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "heartbeat" }));
      }
    }, 45_000);
    return () => clearInterval(id);
  }, [isConnected, isCourse]);

  useEffect(() => {
    setSessionOrMembershipError(null);
    setWsTransientError(null);
    setOutbox([]);
    dispatchedOutboxLocalIdsRef.current.clear();
    setLastReadByUserId({});
    setTypingPeers(new Map());
    typingTimeoutsRef.current.forEach(clearTimeout);
    typingTimeoutsRef.current.clear();
    setRateLimitedUntil(0);
  }, [threadId]);

  useEffect(() => {
    return () => {
      typingTimeoutsRef.current.forEach(clearTimeout);
      typingTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!threadId) {
      return;
    }
    connect();
    return () => disconnect();
  }, [threadId, connect, disconnect]);

  const historyErrorMessage = isHistoryError ? "Failed to load messages" : null;
  const displayError =
    isHistoryLoading
      ? null
      : historyErrorMessage ?? sessionOrMembershipError ?? wsTransientError;

  return {
    messages,
    outbox,
    retryOutbox,
    isLoading: isHistoryLoading,
    error: displayError,
    isConnected,
    isSendDisabled: false,
    rateLimitedUntil: isCourse ? rateLimitedUntil : 0,
    sendMessage,
    sendTyping,
    fetchHistory: refetchHistory,
    lastReadByUserId: isCourse ? lastReadByUserId : {},
    typingPeers,
    putReadCursor,
    toggleReaction,
  };
}
