import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "@/lib/api";
import type { OpenCheckinSession } from "@/types/attendance";

export const openCheckinSessionQueryKey = ["user-checkin-open-session"] as const;

type OpenCheckinSessionResponse = {
  open_checkin_session?: OpenCheckinSession | null;
};

export const useOpenCheckinSession = (enabled: boolean = true) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: openCheckinSessionQueryKey,
    queryFn: async () => {
      const response = await axiosClient.get("attendances/user-checkin/open-session");
      const payload = response.data?.data as OpenCheckinSessionResponse | undefined;
      return payload?.open_checkin_session ?? null;
    },
    enabled,
    retry: false,
  });

  return {
    openCheckinSession: data ?? null,
    isLoading,
    error,
    refetch,
  };
};
