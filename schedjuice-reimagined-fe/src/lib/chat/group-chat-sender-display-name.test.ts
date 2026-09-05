import { describe, expect, it } from "vitest";

import { groupChatSenderDisplayName, isGroupChatTeacherParticipant } from "@/lib/chat/group-chat-sender-display-name";

describe("groupChatSenderDisplayName", () => {
  const teacherLabel = "Teacher";
  const participants = [
    { id: 1, role_label: "Student" },
    { id: 2, role_label: "Teacher" },
  ];

  it("masks teacher authors for pure-student viewers", () => {
    const viewer = { id: 1, roles: ["student"] };
    expect(
      groupChatSenderDisplayName({
        viewer,
        authorUserId: 2,
        authorNameFromMessage: "Amy Teacher",
        participants,
        anchorUserId: 1,
        teacherLabel,
      }),
    ).toBe("Teacher");
  });

  it("keeps the student viewer own name", () => {
    const viewer = { id: 1, roles: ["student"] };
    expect(
      groupChatSenderDisplayName({
        viewer,
        authorUserId: 1,
        authorNameFromMessage: "Student One",
        participants,
        anchorUserId: 1,
        teacherLabel,
      }),
    ).toBe("Student One");
  });

  it("keeps real names for staff viewers", () => {
    const viewer = { id: 2, roles: ["teacher"] };
    expect(
      groupChatSenderDisplayName({
        viewer,
        authorUserId: 1,
        authorNameFromMessage: "Student One",
        participants,
        anchorUserId: 1,
        teacherLabel,
      }),
    ).toBe("Student One");
  });
});

describe("isGroupChatTeacherParticipant", () => {
  it("uses role_label and anchor fallback", () => {
    expect(isGroupChatTeacherParticipant({ id: 2, role_label: "Teacher" }, 1)).toBe(
      true,
    );
    expect(isGroupChatTeacherParticipant({ id: 1, role_label: "Student" }, 1)).toBe(
      false,
    );
  });
});
