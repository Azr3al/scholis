import { axiosClient } from "@/lib/api";
import type { ChatMessage } from "@/types/chat";

/** Unwrap list body from CustomRenderer / paginated envelopes. */
function extractChatMessagesArray(payload: unknown): ChatMessage[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const inner = root.data;
  if (Array.isArray(inner)) return inner as ChatMessage[];
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const mid = inner as Record<string, unknown>;
    if (Array.isArray(mid.results)) return mid.results as ChatMessage[];
    if (Array.isArray(mid.data)) return mid.data as ChatMessage[];
  }
  return [];
}

/** Align with backend Redis list cache TTL (order of magnitude). */
export const CHAT_THREAD_MESSAGES_STALE_MS = 90_000;
/** v4: `cacheTime`; keeps list warm when navigating back. */
export const CHAT_THREAD_MESSAGES_CACHE_TIME_MS = 5 * 60_000;

const b64 = (s: string) =>
  typeof btoa !== "undefined"
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s).toString("base64");

export const chatThreadMessagesQueryKey = (threadId: number) =>
  ["chat-thread-messages", threadId] as const;

export function sortChatMessages(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

/**
 * Full first-page history for a chat thread (unified API).
 */
export async function fetchThreadMessages(
  threadId: number
): Promise<ChatMessage[]> {
  const params = {
    page: 1,
    size: 100,
    sorts: b64(JSON.stringify(["-created_at"])),
    expand: b64(JSON.stringify(["user"])),
  };
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  const { data } = await axiosClient.get(
    `chat/threads/${threadId}/messages?${qs}`
  );
  const list = extractChatMessagesArray(data);
  return sortChatMessages(list);
}
