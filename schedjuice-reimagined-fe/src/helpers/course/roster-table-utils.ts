import { seniorityEnum } from "@/types/course";

export function buildUserProfileHref(
  userId: string | number,
  pathname: string,
  search: string = "",
): string {
  const ref = encodeURIComponent(`${pathname}${search}`);
  return `/users/${userId}?ref=${ref}`;
}

export type TeachingRoleBadgeProps = {
  show: boolean;
  variant: "main" | "assistant" | null;
  label: string | null;
};

export function getTeachingRoleBadgeProps(
  roleSeniority: string | null | undefined,
  assignedRoleName: string | null | undefined,
): TeachingRoleBadgeProps {
  if (roleSeniority === seniorityEnum.MAIN_TEACHER) {
    return {
      show: true,
      variant: "main",
      label: assignedRoleName?.trim() || "Main Teacher",
    };
  }
  if (roleSeniority === seniorityEnum.ASSISTANT_TEACHER) {
    return {
      show: true,
      variant: "assistant",
      label: assignedRoleName?.trim() || "Assistant Teacher",
    };
  }
  return { show: false, variant: null, label: null };
}
