import type { QueryClient } from "@tanstack/react-query";

import { userPaymentsKeys } from "@/sdk/keys/user-payments";

type InvalidateUserPaymentsCachesOptions = {
  tableUid?: string;
};

/**
 * Bust SDK payment lists and the legacy student-payments grid cache.
 * Grid still uses ["searchuser-payments", …]; list pages use ["user-payments", "list", …].
 */
export async function invalidateUserPaymentsCaches(
  queryClient: QueryClient,
  options?: InvalidateUserPaymentsCachesOptions,
): Promise<void> {
  const gridKey = options?.tableUid
    ? (["searchuser-payments", options.tableUid] as const)
    : (["searchuser-payments"] as const);

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: userPaymentsKeys.all }),
    queryClient.invalidateQueries({ queryKey: [...gridKey] }),
  ]);
}
