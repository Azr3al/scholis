import { describe, expect, it } from "vitest";

import { isCourseWideChatEnabled } from "@/lib/chat/course-wide-chat-access";

describe("isCourseWideChatEnabled", () => {
  it("is false when student–teacher group chat is enabled", () => {
    expect(
      isCourseWideChatEnabled({ is_student_teacher_group_chat_enabled: true }),
    ).toBe(false);
  });

  it("is true when student–teacher group chat is disabled", () => {
    expect(
      isCourseWideChatEnabled({ is_student_teacher_group_chat_enabled: false }),
    ).toBe(true);
  });
});
