import { describe, expect, it } from "vitest";
import {
  parseChatNotificationData,
  pushDataToHref,
} from "@/lib/web-push/parse-push-data";

describe("parseChatNotificationData", () => {
  it("parses course_chat backend payload with thread_id", () => {
    const parsed = parseChatNotificationData({
      type: "course_chat",
      course_id: "42",
      thread_id: "7",
      message_id: "100",
    });
    expect(parsed).toEqual({
      type: "course_chat",
      courseId: "42",
      threadId: "7",
      notificationId: "chat",
    });
  });

  it("parses dm backend payload", () => {
    const parsed = parseChatNotificationData({
      type: "dm",
      thread_id: "9",
      message_id: "55",
    });
    expect(parsed).toEqual({
      type: "dm",
      threadId: "9",
      notificationId: "chat",
    });
  });

  it("still accepts legacy chat+subtype envelope", () => {
    const parsed = parseChatNotificationData({
      type: "chat",
      subtype: "course_chat",
      course_id: "3",
      notification_id: "n-1",
    });
    expect(parsed).toEqual({
      type: "course_chat",
      courseId: "3",
      notificationId: "n-1",
    });
  });
});

describe("pushDataToHref", () => {
  it("routes course chat to the dedicated chat thread page", () => {
    expect(
      pushDataToHref({
        type: "course_chat",
        courseId: "42",
        threadId: "7",
        notificationId: "chat",
      })
    ).toBe("/chat/threads/7?kind=course&courseId=42");
  });

  it("routes dm to the dedicated chat thread page", () => {
    expect(
      pushDataToHref({
        type: "dm",
        threadId: "9",
        notificationId: "chat",
      })
    ).toBe("/chat/threads/9?kind=dm");
  });
});
