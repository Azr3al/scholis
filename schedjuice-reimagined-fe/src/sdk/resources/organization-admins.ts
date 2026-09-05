import type { OrganizationAdmin } from "../_types/organization-admins";
import { unwrapList, type SchedjuiceListEnvelope } from "../core/envelope";
import { searchPath } from "../core/http";
import {
  listKeyPayload,
  toFilterBody,
  toSearchQueryParams,
  type SdkListArgs,
} from "../core/list-args";

export type ListOrganizationAdminsArgs = SdkListArgs & {
  orgId: string | number;
};

export const organizationAdminsKeys = {
  all: ["organization-admins"] as const,
  lists: () => [...organizationAdminsKeys.all, "list"] as const,
  list: (args: ListOrganizationAdminsArgs) =>
    [
      ...organizationAdminsKeys.lists(),
      { orgId: String(args.orgId), ...listKeyPayload(args) },
    ] as const,
};

/** Nested org admins search: POST `/organizations/:orgId/admins/search`. */
export async function listOrganizationAdmins(
  args: ListOrganizationAdminsArgs,
): Promise<{ rows: OrganizationAdmin[]; total: number }> {
  const res = await searchPath<SchedjuiceListEnvelope<OrganizationAdmin>>(
    `organizations/${args.orgId}/admins/search`,
    toSearchQueryParams(args),
    toFilterBody(args),
  );
  return unwrapList<OrganizationAdmin>(res, { pageSize: args.pageSize });
}
