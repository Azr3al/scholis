import { axiosClient } from "@/lib/api";

export type BulkRoleAssignResult = {
  updated: Array<{ id: number; name: string }>;
  skipped: Array<{ id: number; reason: string }>;
  failed: Array<{ id: number; reason: string }>;
};

export async function assignRoleBulk(args: {
  roleSlug: string;
  userIds: number[];
}): Promise<BulkRoleAssignResult> {
  const response = await axiosClient.post("users/assign-role-bulk", {
    role_slug: args.roleSlug,
    user_ids: args.userIds,
  });
  return response.data.data as BulkRoleAssignResult;
}
