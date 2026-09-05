import { describe, expect, it } from "vitest";
import { shouldShowChatBubble } from "./show-chat-bubble";

describe("shouldShowChatBubble", () => {
  it("shows on home and own profile routes only", () => {
    expect(shouldShowChatBubble("/home")).toBe(true);
    expect(shouldShowChatBubble("/profile")).toBe(true);
    expect(shouldShowChatBubble("/users/42", 42)).toBe(true);
    expect(shouldShowChatBubble("/users/42/payment-infos", 42)).toBe(true);
  });

  it("hides on other routes and other users' profiles", () => {
    expect(shouldShowChatBubble("/courses")).toBe(false);
    expect(shouldShowChatBubble("/chat")).toBe(false);
    expect(shouldShowChatBubble("/chat/threads/42")).toBe(false);
    expect(shouldShowChatBubble("/users/42", 7)).toBe(false);
    expect(shouldShowChatBubble("/users/42")).toBe(false);
  });
});
