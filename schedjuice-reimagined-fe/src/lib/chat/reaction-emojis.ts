/** Must match backend `app_chat.reaction_helpers.CHAT_REACTION_EMOJIS`. */
export const CHAT_REACTION_EMOJIS = [
  "👍",
  "👎",
  "😄",
  "🎉",
  "😕",
  "❤️",
  "🚀",
  "👀",
] as const;

export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

/** Quick picker row (matches mobile overlay default). */
export const CHAT_QUICK_REACTION_EMOJIS = CHAT_REACTION_EMOJIS.slice(0, 6);
