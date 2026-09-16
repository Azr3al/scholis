import { isStudentOnlyUser } from "@/helpers/authorization";
import type { accountType } from "@/types/user";

export type GroupChatParticipantRef = {
  id: number;
  role_label?: string | null;
};

export function isGroupChatTeacherParticipant(
  participant: GroupChatParticipantRef,
  anchorUserId?: number | null,
): boolean {
  if (participant.role_label === "Teacher") return true;
  if (participant.role_label === "Student") return false;
  if (anchorUserId != null && participant.id === anchorUserId) return false;
  return true;
}

export function groupChatSenderDisplayName(options: {
  viewer: Pick<accountType, "id" | "roles"> | null | undefined;
  authorUserId: number;
  authorNameFromMessage: string;
  participants?: ReadonlyArray<GroupChatParticipantRef>;
  anchorUserId?: number | null;
  teacherLabel: string;
}): string {
  const {
    viewer,
    authorUserId,
    authorNameFromMessage,
    participants,
    anchorUserId,
    teacherLabel,
  } = options;

  if (!viewer || !isStudentOnlyUser(viewer)) {
    return authorNameFromMessage;
  }
  if (authorUserId === viewer.id) {
    return authorNameFromMessage;
  }

  const participant = participants?.find((p) => p.id === authorUserId);
  if (
    participant &&
    isGroupChatTeacherParticipant(participant, anchorUserId)
  ) {
    return teacherLabel;
  }

  return authorNameFromMessage;
}
