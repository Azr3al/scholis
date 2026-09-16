import { axiosClient } from "@/lib/api";
import type {
  ChatMessage,
  ChatMessageContent,
  ChatReactionSummary,
  ChatThread,
  DmEligibleUser,
} from "@/types/chat";

export type ResolvedCourseThread = {
  id: number;
  kind: "course";
  course: number;
};

export type ToggleChatReactionResult = {
  message_id: number;
  reactions: ChatReactionSummary[];
};

export type DmEligibleUsersPage = {
  results: DmEligibleUser[];
  page: number;
  size: number;
  count: number;
};

export function chatCourseThreadQueryKey(courseId: number) {
  return ["chat-course-thread", courseId] as const;
}

export function chatThreadPresenceQueryKey(threadId: number) {
  return ["chat-thread-presence", threadId] as const;
}

export function dmThreadsQueryKey(userId: number | undefined) {
  return ["chat-threads", "dm", userId ?? "guest"] as const;
}

export function groupThreadsQueryKey(userId: number | undefined) {
  return ["chat-threads", "group", userId ?? "guest"] as const;
}

export async function resolveCourseThread(
  courseId: number
): Promise<ResolvedCourseThread> {
  const { data } = await axiosClient.get(`courses/${courseId}/chat/thread`);
  const inner = (data as { data?: ResolvedCourseThread })?.data;
  if (!inner || typeof inner.id !== "number") {
    throw new Error("Unexpected course thread resolve response");
  }
  return inner;
}

export async function fetchThreadPresence(
  threadId: number
): Promise<number[]> {
  const { data } = await axiosClient.get(`chat/threads/${threadId}/presence`);
  const inner = (data as { data?: unknown })?.data ?? data;
  const row = inner as Record<string, unknown> | undefined;
  const ids = row?.online_user_ids ?? row?.data;
  if (Array.isArray(ids)) return ids as number[];
  const nested = row?.data as Record<string, unknown> | undefined;
  if (nested && Array.isArray(nested.online_user_ids)) {
    return nested.online_user_ids as number[];
  }
  return [];
}

export async function putThreadReadCursor(
  threadId: number,
  lastReadMessageId: number
): Promise<void> {
  await axiosClient.put(`chat/threads/${threadId}/read-state`, {
    last_read_message_id: lastReadMessageId,
  });
}

function unwrapTogglePayload(data: unknown): ToggleChatReactionResult {
  const outer = data as { data?: unknown };
  const inner =
    outer?.data && typeof outer.data === "object"
      ? (outer.data as Record<string, unknown>)
      : (data as Record<string, unknown>);

  const message_id = inner.message_id;
  const reactions = inner.reactions;
  if (typeof message_id !== "number" || !Array.isArray(reactions)) {
    throw new Error("Invalid reaction response");
  }
  return { message_id, reactions: reactions as ChatReactionSummary[] };
}

export async function toggleThreadReaction(
  threadId: number,
  messageId: number,
  emoji: string
): Promise<ToggleChatReactionResult> {
  const { data } = await axiosClient.post(
    `chat/threads/${threadId}/messages/${messageId}/reactions`,
    { emoji }
  );
  return unwrapTogglePayload(data);
}

export async function patchThreadMessage(
  threadId: number,
  messageId: number,
  content: ChatMessageContent
): Promise<unknown> {
  const { data } = await axiosClient.patch(
    `chat/threads/${threadId}/messages/${messageId}`,
    { content }
  );
  return (data as { data?: unknown })?.data;
}

export async function deleteThreadMessage(
  threadId: number,
  messageId: number
): Promise<{
  id?: number;
  deleted_at?: string;
  deleted_by_id?: number | null;
}> {
  const { data } = await axiosClient.delete(
    `chat/threads/${threadId}/messages/${messageId}`
  );
  const row = (data as { data?: Record<string, unknown> })?.data;
  return (row ?? {}) as {
    id?: number;
    deleted_at?: string;
    deleted_by_id?: number | null;
  };
}

export async function fetchDmThreads(): Promise<ChatThread[]> {
  const { data } = await axiosClient.get("chat/threads?kind=dm");
  const rows = (data as { data?: ChatThread[] })?.data;
  return Array.isArray(rows) ? rows : [];
}

export async function fetchGroupThreads(): Promise<ChatThread[]> {
  const { data } = await axiosClient.get("chat/threads?kind=group");
  const rows = (data as { data?: ChatThread[] })?.data;
  return Array.isArray(rows) ? rows : [];
}

export async function fetchDmEligibleUsers(params: {
  q?: string;
  page?: number;
  size?: number;
}): Promise<DmEligibleUsersPage> {
  const page = Math.max(1, params.page ?? 1);
  const size = Math.min(100, Math.max(1, params.size ?? 20));
  const sp = new URLSearchParams({
    page: String(page),
    size: String(size),
  });
  const q = (params.q ?? "").trim();
  if (q) sp.set("q", q);
  const { data } = await axiosClient.get(
    `chat/dm/eligible-users?${sp.toString()}`
  );
  const inner =
    (
      data as {
        data?: Partial<DmEligibleUsersPage>;
      }
    )?.data ?? {};
  return {
    results: Array.isArray(inner.results) ? inner.results : [],
    page: typeof inner.page === "number" ? inner.page : page,
    size: typeof inner.size === "number" ? inner.size : size,
    count: typeof inner.count === "number" ? inner.count : 0,
  };
}

export async function startDmConversation(
  participantUserId: number,
  content: ChatMessage["content"],
  options?: { clientMessageId?: string; replyToId?: number }
): Promise<{ thread: ChatThread; message: ChatMessage; created: boolean }> {
  const { data } = await axiosClient.post("chat/threads", {
    kind: "dm",
    participant_user_id: participantUserId,
    content,
    ...(options?.clientMessageId
      ? { client_message_id: options.clientMessageId }
      : {}),
    ...(options?.replyToId != null ? { reply_to_id: options.replyToId } : {}),
  });
  const inner = (data as { data?: Record<string, unknown> })?.data;
  const thread = inner?.thread as ChatThread | undefined;
  const message = inner?.message as ChatMessage | undefined;
  if (!thread || typeof thread.id !== "number" || !message) {
    throw new Error("Unexpected start DM conversation response");
  }
  return {
    thread,
    message,
    created: Boolean(inner?.created),
  };
}
