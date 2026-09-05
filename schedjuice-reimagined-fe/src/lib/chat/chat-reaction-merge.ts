import type { ChatMessage, ChatReactionSummary } from "@/types/chat";

function mergeReactionChangedIntoList(
  messages: ChatMessage[],
  messageId: number,
  reactions: ChatReactionSummary[]
): ChatMessage[] {
  return messages.map((m) =>
    m.id === messageId ? { ...m, reactions: reactions.length ? reactions : [] } : m
  );
}

export function mergeReactionChangedIntoMessages(
  messages: ChatMessage[],
  payload: { message_id: number; reactions: ChatReactionSummary[] }
): ChatMessage[] {
  return mergeReactionChangedIntoList(
    messages,
    payload.message_id,
    payload.reactions
  );
}

function removeUserFromReaction(
  reactions: ChatReactionSummary[],
  userId: number
): ChatReactionSummary[] {
  return reactions
    .map((r) => {
      if (!r.user_ids.includes(userId)) return r;
      const user_ids = r.user_ids.filter((id) => id !== userId);
      if (user_ids.length === 0) return null;
      return {
        ...r,
        count: user_ids.length,
        user_ids,
        reacted_by_me: false,
      };
    })
    .filter((r): r is ChatReactionSummary => r !== null);
}

export function optimisticToggleReaction(
  messages: ChatMessage[],
  messageId: number,
  emoji: string,
  currentUserId: number | undefined
): ChatMessage[] {
  if (!currentUserId) return messages;

  return messages.map((m) => {
    if (m.id !== messageId) return m;
    const prev = m.reactions ?? [];
    const mine = prev.find((r) => r.reacted_by_me);

    if (mine?.emoji === emoji) {
      return { ...m, reactions: removeUserFromReaction(prev, currentUserId) };
    }

    let base = removeUserFromReaction(prev, currentUserId);
    const idx = base.findIndex((r) => r.emoji === emoji);
    if (idx >= 0) {
      const row = base[idx];
      base = base.map((r, i) =>
        i === idx
          ? {
              ...row,
              count: row.count + 1,
              user_ids: [...row.user_ids, currentUserId],
              reacted_by_me: true,
            }
          : r
      );
    } else {
      base = [
        ...base,
        { emoji, count: 1, user_ids: [currentUserId], reacted_by_me: true },
      ];
    }
    return { ...m, reactions: base };
  });
}
