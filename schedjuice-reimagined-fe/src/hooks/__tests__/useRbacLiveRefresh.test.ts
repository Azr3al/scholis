import { describe, it, expect } from "vitest";
import { isRbacUpdateMessage } from "../useRbacLiveRefresh";

describe("isRbacUpdateMessage", () => {
  it("returns true even when the payload carries extra fields", () => {
    expect(
      isRbacUpdateMessage(
        JSON.stringify({ type: "rbac.updated", scope: "tenant", id: 5 }),
      ),
    ).toBe(true);
  });

  it("returns false for an unrelated message type", () => {
    expect(isRbacUpdateMessage(JSON.stringify({ type: "chat.message" }))).toBe(false);
  });

  it("returns false for malformed JSON", () => {
    expect(isRbacUpdateMessage("not-json{{")).toBe(false);
  });
});
