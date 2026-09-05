import type { OrganizationUser } from "../_types/organization-users";
import { unwrapList, type SchedjuiceListEnvelope } from "../core/envelope";
import { searchPath } from "../core/http";
import {
  listKeyPayload,
  toFilterBody,
  toSearchQueryParams,
  type SdkListArgs,
} from "../core/list-args";

export type SearchOrganizationUsersArgs = SdkListArgs & {
  orgId: string | number;
};

export const organizationUsersKeys = {
  all: ["organization-users"] as const,
  lists: () => [...organizationUsersKeys.all, "list"] as const,
  list: (args: SearchOrganizationUsersArgs) =>
    [
      ...organizationUsersKeys.lists(),
      { orgId: String(args.orgId), ...listKeyPayload(args) },
    ] as const,
};

/** Nested org user search: POST `/organizations/:orgId/users/search`. */
export async function searchOrganizationUsers(
  args: SearchOrganizationUsersArgs,
): Promise<{ rows: OrganizationUser[]; total: number }> {
  const res = await searchPath<SchedjuiceListEnvelope<OrganizationUser>>(
    `organizations/${args.orgId}/users/search`,
    toSearchQueryParams(args),
    toFilterBody(args),
  );
  return unwrapList<OrganizationUser>(res, { pageSize: args.pageSize });
}
