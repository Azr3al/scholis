import type { AutoFormGroup } from "@/components/auto-form";
import { hasAdminCredentials } from "@/helpers/authorization";
import type { accountType } from "@/types/user";

const ACTIVE_FIELD = "is_active";
const SORT_ORDER_FIELD = "sort_order";

export function canManageActiveStatus(user: accountType | undefined | null): boolean {
  return Boolean(user && hasAdminCredentials(user));
}

export function omitFormFields(
  fields: string[],
  omit: { active?: boolean; sortOrder?: boolean },
): string[] {
  return fields.filter((field) => {
    if (omit.active && field === ACTIVE_FIELD) return false;
    if (omit.sortOrder && field === SORT_ORDER_FIELD) return false;
    return true;
  });
}

export function activeStatusGroup(canShow: boolean): AutoFormGroup | null {
  if (!canShow) return null;
  return {
    id: "status",
    title: "Status",
    fields: [ACTIVE_FIELD],
  };
}

export function appendActiveStatusGroup(
  groups: AutoFormGroup[],
  canShow: boolean,
): AutoFormGroup[] {
  const statusGroup = activeStatusGroup(canShow);
  return statusGroup ? [...groups, statusGroup] : groups;
}

export function highRiskFieldsWithActive(
  baseFields: readonly string[],
  canManageActive: boolean,
): string[] {
  return canManageActive
    ? [...baseFields, ACTIVE_FIELD]
    : [...baseFields];
}
