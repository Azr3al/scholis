import type { QueryClient } from "@tanstack/react-query";

import { pendingUserDvrsQueryKey } from "@/helpers/dvr";

/** Bust AppShell DVR banner cache after verify / when assignment is already verified. */
export function invalidatePendingUserDvrs(
  queryClient: QueryClient,
  userId: number | string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: pendingUserDvrsQueryKey(userId),
  });
}
