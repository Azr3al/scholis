import type { User } from "../_types/users";
import { unwrapList, type SchedjuiceListEnvelope } from "../core/envelope";
import { searchPath } from "../core/http";
import {
  listKeyPayload,
  toFilterBody,
  toSearchQueryParams,
  type SdkListArgs,
} from "../core/list-args";

export type ListUnpaidUsersArgs = SdkListArgs;

export const unpaidUsersKeys = {
  all: ["user-payments/unpaid"] as const,
  lists: () => [...unpaidUsersKeys.all, "list"] as const,
  list: (args: SdkListArgs) =>
    [...unpaidUsersKeys.lists(), listKeyPayload(args)] as const,
};

/** Custom report endpoint used by unpaid-students page. */
export async function listUnpaidUsers(
  args: ListUnpaidUsersArgs,
): Promise<{ rows: User[]; total: number }> {
  const res = await searchPath<SchedjuiceListEnvelope<User>>(
    "user-payments/unpaid",
    toSearchQueryParams(args),
    toFilterBody(args),
  );
  return unwrapList<User>(res, { pageSize: args.pageSize });
}
