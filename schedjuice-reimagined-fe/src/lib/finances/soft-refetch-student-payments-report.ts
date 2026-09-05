import type { QueryClient } from "@tanstack/react-query";

type SoftRefetchStudentPaymentsOptions = {
  tableUid?: string;
};

/**
 * Soft-reconcile payment list/report caches after an optimistic row patch.
 * Uses refetchQueries (keeps current data visible) — never invalidateQueries.
 */
export async function softRefetchStudentPaymentsReport(
  queryClient: QueryClient,
  options?: SoftRefetchStudentPaymentsOptions,
): Promise<void> {
  const searchKey = options?.tableUid
    ? (["searchuser-payments", options.tableUid] as const)
    : (["searchuser-payments"] as const);

  await Promise.all([
    queryClient.refetchQueries({ queryKey: [...searchKey] }),
    queryClient.refetchQueries({ queryKey: ["user-payments"] }),
  ]);
}
