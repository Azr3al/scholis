import type { DmEligibleUser } from "@/types/chat";

export const CHAT_INBOX_PATH = "/chat";

export type ChatThreadKind = "dm" | "group" | "course";

export type ChatThreadNavTarget =
  | {
      kind: "dm";
      threadId?: number;
      participantUserId?: number;
      title?: string;
      otherParticipant?: DmEligibleUser | null;
    }
  | {
      kind: "group";
      threadId: number;
      title?: string;
    }
  | {
      kind: "course";
      courseId: number;
      threadId?: number;
      title?: string;
    };

export type ParsedChatThreadRoute =
  | {
      threadId: number | "new";
      kind: "dm";
      title?: string;
      participantUserId?: number;
    }
  | {
      threadId: number;
      kind: "group";
      title?: string;
    }
  | {
      threadId: number | "new";
      kind: "course";
      title?: string;
      courseId: number;
    };

function appendTitle(params: URLSearchParams, title?: string) {
  const trimmed = title?.trim();
  if (trimmed) {
    params.set("title", trimmed);
  }
}

export function buildChatThreadHref(target: ChatThreadNavTarget): string {
  if (target.kind === "dm") {
    const threadSegment =
      target.threadId != null
        ? String(target.threadId)
        : target.participantUserId != null
          ? "new"
          : null;
    if (!threadSegment) {
      return CHAT_INBOX_PATH;
    }
    const params = new URLSearchParams({ kind: "dm" });
    if (target.participantUserId != null) {
      params.set("participantUserId", String(target.participantUserId));
    }
    appendTitle(params, target.title ?? target.otherParticipant?.name);
    return `/chat/threads/${threadSegment}?${params.toString()}`;
  }

  if (target.kind === "group") {
    const params = new URLSearchParams({ kind: "group" });
    appendTitle(params, target.title);
    return `/chat/threads/${target.threadId}?${params.toString()}`;
  }

  const threadSegment =
    target.threadId != null ? String(target.threadId) : "new";
  const params = new URLSearchParams({
    kind: "course",
    courseId: String(target.courseId),
  });
  appendTitle(params, target.title);
  return `/chat/threads/${threadSegment}?${params.toString()}`;
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

const CHAT_THREAD_KINDS: ChatThreadKind[] = ["dm", "group", "course"];

function isChatThreadKind(value: string): value is ChatThreadKind {
  return CHAT_THREAD_KINDS.includes(value as ChatThreadKind);
}

export function parseChatThreadSearchParams(
  threadIdParam: string,
  searchParams: URLSearchParams,
): ParsedChatThreadRoute | null {
  const kindRaw = searchParams.get("kind");
  if (!kindRaw || !isChatThreadKind(kindRaw)) {
    return null;
  }

  const title = searchParams.get("title")?.trim() || undefined;
  const threadId =
    threadIdParam === "new" ? "new" : parsePositiveInt(threadIdParam);

  if (threadId == null) {
    return null;
  }

  if (kindRaw === "dm") {
    const participantUserId = parsePositiveInt(
      searchParams.get("participantUserId"),
    );
    if (threadId === "new" && !participantUserId) {
      return null;
    }
    if (typeof threadId === "number" && participantUserId) {
      return null;
    }
    return {
      threadId,
      kind: "dm",
      title,
      participantUserId,
    };
  }

  if (kindRaw === "group") {
    if (threadId === "new") {
      return null;
    }
    return {
      threadId,
      kind: "group",
      title,
    };
  }

  const courseId = parsePositiveInt(searchParams.get("courseId"));
  if (!courseId) {
    return null;
  }
  return {
    threadId,
    kind: "course",
    title,
    courseId,
  };
}

export function isChatPath(pathname: string): boolean {
  return pathname === CHAT_INBOX_PATH || pathname.startsWith(`${CHAT_INBOX_PATH}/`);
}
