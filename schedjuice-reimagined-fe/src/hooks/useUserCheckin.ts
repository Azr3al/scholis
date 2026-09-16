import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "@/lib/api";
import { CheckinStatus, UserCheckinCurrentEvent, UserCheckinStatus } from "@/types/attendance";

export const userCheckinStatusQueryKey = (courseId: string) =>
  ["user-checkin-status", courseId] as const;

const CHECKIN_WINDOW_REFETCH_MS = 30_000;

export const useUserCheckin = (courseId: string, enabled: boolean = true) => {
  const { data: checkinStatus, refetch, isLoading, error } = useQuery({
    queryKey: userCheckinStatusQueryKey(courseId),
    queryFn: () => axiosClient.get(`attendances/user-checkin/${courseId}`),
    enabled,
    retry: false,
    refetchInterval: (data) => {
      const status = data?.data?.data as UserCheckinStatus | undefined;
      if (status?.checkin_block_reason === "checkin_too_early") {
        return CHECKIN_WINDOW_REFETCH_MS;
      }
      if (
        status?.checkin_block_reason === "checkin_after_event_end" &&
        (status.completed_events ?? 0) < (status.total_events ?? 0)
      ) {
        return CHECKIN_WINDOW_REFETCH_MS;
      }
      return false;
    },
  });

  const statusData = checkinStatus?.data?.data as UserCheckinStatus | undefined;
  const currentStatus = statusData?.checkin_status;
  const hasEventsToday = statusData?.has_events_today;
  const canCheckIn = statusData?.can_check_in || false;
  const canCheckOut = statusData?.can_check_out || false;
  const currentEvent = statusData?.current_event as UserCheckinCurrentEvent | undefined;
  const totalEvents = statusData?.total_events || 0;
  const completedEvents = statusData?.completed_events || 0;
  const hasStaleOpenSession = statusData?.has_stale_open_session || false;
  const checkinOpensAt = statusData?.checkin_opens_at ?? null;
  const checkinClosesAt = statusData?.checkin_closes_at ?? null;
  const checkinBlockReason = statusData?.checkin_block_reason ?? null;
  const checkinBlockMessage = statusData?.checkin_block_message ?? null;
  const openCheckinSession = statusData?.open_checkin_session ?? null;

  return {
    currentStatus: currentStatus || CheckinStatus.not_checked_in,
    hasEventsToday: hasEventsToday || false,
    canCheckIn,
    canCheckOut,
    currentEvent,
    openCheckinSession,
    totalEvents,
    completedEvents,
    hasStaleOpenSession,
    checkinOpensAt,
    checkinClosesAt,
    checkinBlockReason,
    checkinBlockMessage,
    buttonDisabled: !canCheckIn && !canCheckOut,
    isLoading,
    error,
    refetch,
  };
};
