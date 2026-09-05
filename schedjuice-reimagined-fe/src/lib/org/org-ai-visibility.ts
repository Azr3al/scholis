import { hasAdminCredentials, permissionsFor } from "@/helpers/authorization";
import type { OrgRecordContext } from "@/config/org-record-sections";

export function canViewOrgAiSection(ctx: OrgRecordContext): boolean {
  if (!hasAdminCredentials(ctx.viewer)) return false;
  const perms = permissionsFor(ctx.viewer);
  return perms.can("org.configure") || perms.can("ai.usage.view");
}

export function canViewOrgAiUsagePane(ctx: OrgRecordContext): boolean {
  return permissionsFor(ctx.viewer).can("ai.usage.view");
}
