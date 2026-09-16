import { isAdmin, isSuperAdmin } from "@/helpers/authorization";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export function canViewHrSection({
  viewer,
  tenant,
}: {
  viewer: accountType;
  tenant: organizationType | null | undefined;
}): boolean {
  return (
    Boolean(tenant?.is_hr_fields_enabled) &&
    (isSuperAdmin(viewer) || isAdmin(viewer))
  );
}
