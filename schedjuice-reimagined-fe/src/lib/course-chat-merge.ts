import type { ChatMessage, ChatMessageContent } from "@/types/chat";

/** Normalize message id from HTTP / WS (number or numeric string). */
function coerceChatMessageId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Apply a server row (PATCH body or message_edited WS) onto an existing message.
 * Avoids blind object spread so extra keys (e.g. course, deleted_by) cannot corrupt shape.
 */
function mergeServerChatRowIntoMessage(
  prev: ChatMessage,
  patch: Record<string, unknown>
): ChatMessage {
  const id = coerceChatMessageId(patch.id) ?? prev.id;
  const next: ChatMessage = { ...prev, id };

  if ("content" in patch) {
    const c = patch.content;
    if (c !== null && isRecord(c) && typeof c.text === "string") {
      next.content = c as ChatMessageContent;
    }
  }

  if ("user" in patch && patch.user != null) {
    if (typeof patch.user === "number" || isRecord(patch.user)) {
      next.user = patch.user as ChatMessage["user"];
    }
  }

  if ("reply_to" in patch) {
    next.reply_to = patch.reply_to as ChatMessage["reply_to"];
  }

  if ("created_at" in patch && typeof patch.created_at === "string") {
    next.created_at = patch.created_at;
  }

  if ("edited_at" in patch) {
    next.edited_at =
      patch.edited_at === null || patch.edited_at === undefined
        ? null
        : String(patch.edited_at);
  }

  if ("deleted_at" in patch) {
    next.deleted_at =
      patch.deleted_at === null || patch.deleted_at === undefined
        ? null
        : String(patch.deleted_at);
  }

  if ("reactions" in patch) {
    next.reactions = Array.isArray(patch.reactions)
      ? (patch.reactions as ChatMessage["reactions"])
      : [];
  }

  const delBy =
    patch.deleted_by_id !== undefined
      ? patch.deleted_by_id
      : patch.deleted_by !== undefined
        ? patch.deleted_by
        : undefined;
  if (delBy !== undefined) {
    if (delBy === null) {
      next.deleted_by_id = null;
    } else if (typeof delBy === "number" && Number.isFinite(delBy)) {
      next.deleted_by_id = delBy;
    } else {
      const n = Number(delBy);
      next.deleted_by_id = Number.isFinite(n)
        ? n
        : (prev.deleted_by_id ?? null);
    }
  }

  return next;
}

/**
 * Merge one server row into the cached message list (by id). If missing, append when
 * the patch is a full-enough row (PATCH / WS always sends a full row today).
 */
export function mergeChatMessagePatchIntoList(
  list: ChatMessage[],
  patchRow: unknown
): ChatMessage[] {
  if (!isRecord(patchRow)) return list;
  const id = coerceChatMessageId(patchRow.id);
  if (id === null) return list;

  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) {
    const row = patchRow as unknown as ChatMessage;
    if (
      row.content &&
      typeof row.content === "object" &&
      typeof row.content.text === "string" &&
      typeof row.created_at === "string"
    ) {
      return [...list, row];
    }
    return list;
  }
  const merged = mergeServerChatRowIntoMessage(list[idx], patchRow);
  const next = [...list];
  next[idx] = merged;
  return next;
}
