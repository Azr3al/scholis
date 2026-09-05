import { useQuery } from "@tanstack/react-query";

import { axiosClient } from "@/lib/api";
import type { ProfileCompleteness } from "@/types/completion";
import { EMPTY_COMPLETENESS } from "@/types/completion";

export function profileCompletenessKey(userId: number) {
  return ["profileCompleteness", userId] as const;
}

/** GET users/<id>/completeness → { percent, missing[] }. */
export function useProfileCompleteness(
  userId: number | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false && typeof userId === "number";
  return useQuery({
    queryKey: profileCompletenessKey(userId ?? -1),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<ProfileCompleteness> => {
      const res = await axiosClient.get(`users/${userId}/completeness`);
      const data = (res.data?.data ?? res.data) as Partial<ProfileCompleteness>;
      return {
        percent:
          typeof data.percent === "number"
            ? data.percent
            : EMPTY_COMPLETENESS.percent,
        missing: Array.isArray(data.missing) ? data.missing : [],
      };
    },
  });
}
