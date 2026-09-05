import { describe, expect, it } from "vitest";
import type { ChatThread } from "@/types/chat";
import {
  deriveOtherParticipant,
  findDmThreadByParticipant,
} from "@/lib/chat-threads/derive-dm-participant";

const baseThread = (overrides: Partial<ChatThread> = {}): ChatThread => ({
  id: 1,
  kind: "dm",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  participants: [
    { id: 10, name: "Me", email: "me@test.com", profile_image: null },
    { id: 20, name: "Peer", email: "peer@test.com", profile_image: null },
  ],
  last_message: null,
  unread_count: 0,
  ...overrides,
});

describe("deriveOtherParticipant", () => {
  it("filters out the current user", () => {
    const other = deriveOtherParticipant(baseThread(), 10);
    expect(other?.id).toBe(20);
    expect(other?.name).toBe("Peer");
  });

  it("returns first participant when viewer id is unknown", () => {
    const other = deriveOtherParticipant(baseThread(), undefined);
    expect(other?.id).toBe(10);
  });
});

describe("findDmThreadByParticipant", () => {
  it("finds a thread by the other participant id", () => {
    const threads = [baseThread({ id: 5 }), baseThread({ id: 6, participants: [
      { id: 10, name: "Me", email: "me@test.com", profile_image: null },
      { id: 30, name: "Other", email: "o@test.com", profile_image: null },
    ] })];
    const found = findDmThreadByParticipant(threads, 30, 10);
    expect(found?.id).toBe(6);
  });
});
