import { describe, expect, it } from "vitest";
import { optimisticToggleReaction } from "@/lib/chat/chat-reaction-merge";
import type { ChatMessage } from "@/types/chat";

const baseMessage = (
  id: number,
  reactions: ChatMessage["reactions"] = []
): ChatMessage => ({
  id,
  user: { id: 1, email: "a@b.c", name: "A" },
  content: { text: "hi" },
  created_at: "2026-01-01T00:00:00Z",
  reactions,
});

describe("optimisticToggleReaction", () => {
  it("adds a reaction for the current user", () => {
    const messages = [baseMessage(1)];
    const next = optimisticToggleReaction(messages, 1, "👍", 42);
    expect(next[0].reactions).toEqual([
      { emoji: "👍", count: 1, user_ids: [42], reacted_by_me: true },
    ]);
  });

  it("removes the reaction when toggling the same emoji", () => {
    const messages = [
      baseMessage(1, [
        { emoji: "👍", count: 1, user_ids: [42], reacted_by_me: true },
      ]),
    ];
    const next = optimisticToggleReaction(messages, 1, "👍", 42);
    expect(next[0].reactions).toEqual([]);
  });

  it("replaces the previous reaction with a new emoji", () => {
    const messages = [
      baseMessage(1, [
        { emoji: "👍", count: 1, user_ids: [42], reacted_by_me: true },
        { emoji: "❤️", count: 1, user_ids: [7], reacted_by_me: false },
      ]),
    ];
    const next = optimisticToggleReaction(messages, 1, "❤️", 42);
    expect(next[0].reactions).toEqual([
      { emoji: "❤️", count: 2, user_ids: [7, 42], reacted_by_me: true },
    ]);
  });
});
