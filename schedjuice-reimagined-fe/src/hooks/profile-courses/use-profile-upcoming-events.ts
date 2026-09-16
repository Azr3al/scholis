"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import {
  addCalendarDaysToTenantYmd,
  getTenantDayBoundariesIso,
  getTenantTodayYmd,
} from "@/helpers/shortcuts-time";
import type { ProfileCalendarEventLike } from "@/helpers/user-profile";
import { operatorEnum } from "@/types/api";

export const PROFILE_UPCOMING_EVENT_DAYS = 14;

export function useProfileUpcomingEvents(
  subjectId: string | undefined,
  tenantTimezone: string | null | undefined,
  enabled: boolean,
  daySpan = PROFILE_UPCOMING_EVENT_DAYS,
) {
  const tz = tenantTimezone ?? "UTC";
  const { startIso, endIso } = useMemo(() => {
    const today = getTenantTodayYmd(tz);
    const endDay = addCalendarDaysToTenantYmd(today, tz, daySpan);
    const start = getTenantDayBoundariesIso(tz, today).startIso;
    const end = getTenantDayBoundariesIso(tz, endDay).endIso;
    return { startIso: start, endIso: end };
  }, [tz, daySpan]);

  return useQuery({
    queryKey: ["profileUpcomingEvents", subjectId, startIso, endIso],
    enabled: enabled && Boolean(subjectId),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await searchEntities(
        "events",
        {
          size: -1,
          expand: ["course"],
          fields: ["id", "title", "date", "time_from", "time_to", "course"],
          sorts: ["date", "time_from"],
        },
        {
          filter_params: [
            {
              field_name: "course__user_courses__user_id",
              operator: operatorEnum.exact,
              value: String(subjectId),
            },
            { field_name: "date", operator: operatorEnum.gte, value: startIso },
            { field_name: "date", operator: operatorEnum.lte, value: endIso },
          ],
        },
      );
      return (res.data?.data ?? []) as ProfileCalendarEventLike[];
    },
  });
}
