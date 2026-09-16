import type { organizationType } from "@/types/organization";

/** Whole-roster course chat is hidden when student–teacher class chats are enabled. */
export function isCourseWideChatEnabled(
  tenant: Pick<organizationType, "is_student_teacher_group_chat_enabled"> | null | undefined,
): boolean {
  return !tenant?.is_student_teacher_group_chat_enabled;
}
