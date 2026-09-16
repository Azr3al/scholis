import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "@/lib/api";
import { CampusCheckinStatus } from "@/types/campus-checkin";
import { useTenant } from "@/hooks/useTenant";

export function useCampusCheckin(enabled = true) {
  const { tenant } = useTenant();
  const isFeatureOn = tenant?.is_building_checkin_enabled ?? false;

  const query = useQuery({
    queryKey: ["campus-checkin-status"],
    queryFn: async () => {
      const res = await axiosClient.get("campus-checkin/status");
      return res.data.data as CampusCheckinStatus;
    },
    enabled: enabled && isFeatureOn,
    retry: false,
  });

  return {
    status: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
