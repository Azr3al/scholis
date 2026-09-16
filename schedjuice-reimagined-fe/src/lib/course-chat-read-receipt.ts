import { role } from "@/types/user";

export type CourseChatMemberForReceipt = {
  userId: number;
  assigned_as: "teacher" | "student";
  /** When `is_removed` is true, member is excluded from counts and targets. */
  is_removed?: boolean;
  /** From expanded `user_courses.user`; used for >30-member staff rule alongside teachers. */
  org_roles?: role[];
};

/**
 * IDs that must have read a message (cursor >= message id) for it to show as Read.
 * Mirrors backend `staff_read_receipt_user_ids` when memberCount > 30: teachers in course
 * plus org admins/managers/superadmins who are course members. If `org_roles` is missing
 * on rows, FE cannot see org-admin-only members — we still count teachers (see comment in caller).
 */
export function getReadReceiptTargetUserIds(
  members: CourseChatMemberForReceipt[],
  currentUserId: number
): number[] {
  const active = members.filter((m) => m.is_removed !== true);
  const memberCount = active.length;
  const others = active.map((m) => m.userId).filter((id) => id !== currentUserId);

  if (memberCount <= 30) {
    return others;
  }

  const staff = new Set<number>();
  for (const m of active) {
    if (m.userId === currentUserId) continue;
    if (m.assigned_as === "teacher") {
      staff.add(m.userId);
    }
    const isOrgAdmin =
      m.org_roles?.some(
        (r) => r === role.admin || r === role.manager || r === role.superadmin
      ) ?? false;
    if (isOrgAdmin) {
      staff.add(m.userId);
    }
  }
  return Array.from(staff);
}

export function isMessageReadByTargets(
  messageId: number,
  lastReadByUserId: Record<number, number>,
  targetUserIds: number[]
): boolean {
  if (targetUserIds.length === 0) return true;
  return targetUserIds.every((uid) => (lastReadByUserId[uid] ?? 0) >= messageId);
}
