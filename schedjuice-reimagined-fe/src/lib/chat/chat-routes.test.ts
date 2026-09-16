import { describe, expect, it } from "vitest";
import {
  buildChatThreadHref,
  isChatPath,
  parseChatThreadSearchParams,
} from "./chat-routes";

describe("buildChatThreadHref", () => {
  it("builds dm thread href with title", () => {
    expect(
      buildChatThreadHref({
        kind: "dm",
        threadId: 42,
        title: "Jane Doe",
      }),
    ).toBe("/chat/threads/42?kind=dm&title=Jane+Doe");
  });

  it("builds draft dm href", () => {
    expect(
      buildChatThreadHref({
        kind: "dm",
        participantUserId: 99,
        title: "Jane Doe",
      }),
    ).toBe("/chat/threads/new?kind=dm&participantUserId=99&title=Jane+Doe");
  });

  it("builds group and course hrefs", () => {
    expect(
      buildChatThreadHref({
        kind: "group",
        threadId: 7,
        title: "Math 101",
      }),
    ).toBe("/chat/threads/7?kind=group&title=Math+101");

    expect(
      buildChatThreadHref({
        kind: "course",
        courseId: 5,
        threadId: 12,
        title: "Physics",
      }),
    ).toBe("/chat/threads/12?kind=course&courseId=5&title=Physics");
  });
});

describe("parseChatThreadSearchParams", () => {
  it("parses dm, group, and course params", () => {
    expect(
      parseChatThreadSearchParams(
        "42",
        new URLSearchParams("kind=dm&title=Jane"),
      ),
    ).toEqual({
      threadId: 42,
      kind: "dm",
      title: "Jane",
    });

    expect(
      parseChatThreadSearchParams(
        "7",
        new URLSearchParams("kind=group&title=Class"),
      ),
    ).toEqual({
      threadId: 7,
      kind: "group",
      title: "Class",
    });

    expect(
      parseChatThreadSearchParams(
        "12",
        new URLSearchParams("kind=course&courseId=5"),
      ),
    ).toEqual({
      threadId: 12,
      kind: "course",
      courseId: 5,
    });
  });

  it("parses draft dm", () => {
    expect(
      parseChatThreadSearchParams(
        "new",
        new URLSearchParams("kind=dm&participantUserId=99"),
      ),
    ).toEqual({
      threadId: "new",
      kind: "dm",
      participantUserId: 99,
    });
  });

  it("returns null for invalid params", () => {
    expect(
      parseChatThreadSearchParams(
        "new",
        new URLSearchParams("kind=dm"),
      ),
    ).toBeNull();
    expect(
      parseChatThreadSearchParams(
        "new",
        new URLSearchParams("kind=group"),
      ),
    ).toBeNull();
    expect(
      parseChatThreadSearchParams(
        "12",
        new URLSearchParams("kind=course"),
      ),
    ).toBeNull();
    expect(
      parseChatThreadSearchParams(
        "12",
        new URLSearchParams("kind=unknown"),
      ),
    ).toBeNull();
  });
});

describe("isChatPath", () => {
  it("matches chat routes", () => {
    expect(isChatPath("/chat")).toBe(true);
    expect(isChatPath("/chat/threads/42")).toBe(true);
    expect(isChatPath("/courses")).toBe(false);
  });
});
