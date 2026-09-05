"use client";
import { Skeleton } from "@/components/primitives";

import { formatTimeslotRangeForDisplay } from "@/helpers/timeslot";
import {
  eventDateToTenantCalendarDay,
  profileEventDisplayTitle,
  type ProfileOngoingSession,
} from "@/helpers/user-profile";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";
import { MediaVideo as Video } from "iconoir-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type UserProfileStatsProps = {
  userId: string;
  teachingCoursesCount: number | null;
  ongoingSessions: ProfileOngoingSession[];
  tenantTimezone?: string | null;
  /** Logged-in user is viewing their own profile */
  isViewingOwnProfile: boolean;
  /** Profile subject display name (for third-person teaching label) */
  profileDisplayName: string;
  isLoading?: boolean;
};

function firstNameOrShortLabel(displayName: string): string {
  const t = displayName.trim();
  if (!t) return "This person";
  return t.split(/\s+/)[0] ?? t;
}

export function UserProfileStats({
  userId,
  teachingCoursesCount,
  ongoingSessions,
  tenantTimezone,
  isViewingOwnProfile,
  profileDisplayName,
  isLoading = false,
}: UserProfileStatsProps) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const showTeaching =
    teachingCoursesCount !== null && teachingCoursesCount !== undefined;
  const showOngoing = ongoingSessions.length > 0;

  const teachingHeading = isViewingOwnProfile
    ? "Classes you teach"
    : `${firstNameOrShortLabel(profileDisplayName)}'s teaching classes`;
  const teachingSub = "Active and planned";

  if (isLoading) {
    return (
      <div
        className="flex min-h-24 flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-start [overflow-anchor:none]"
        aria-busy="true"
        aria-label="Loading profile stats"
      >
        <Skeleton className="h-20 min-w-[min(100%,20rem)] flex-1" />
        <Skeleton className="h-20 min-w-[10rem] flex-1" />
      </div>
    );
  }

  if (!showTeaching && !showOngoing) return null;

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-start [overflow-anchor:none]">
      {showOngoing && (
        <div className="order-first flex min-w-[min(100%,20rem)] flex-1 flex-col gap-3 sm:order-none">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <Video className="size-4 shrink-0 text-primary" aria-hidden />
            In session now
          </div>
          <ul className="flex flex-col gap-3">
            {ongoingSessions.map((ev) => {
              const title = profileEventDisplayTitle(ev);
              return (
                <li
                  key={String(ev.id ?? `${ev.date}-${ev.time_from}`)}
                  className="flex flex-col gap-1 text-sm text-text-muted"
                >
                  <Link
                    href={`/courses/${ev.courseId}`}
                    className="w-fit font-medium text-text-primary underline-offset-4 transition-colors hover:text-primary hover:underline"
                  >
                    {title}
                  </Link>
                  {ev.date && ev.time_from && ev.time_to && (
                    <span className="block text-xs tabular-nums text-text-muted">
                      {formatTimeslotRangeForDisplay(
                        {
                          date:
                            eventDateToTenantCalendarDay(
                              String(ev.date),
                              tenantTimezone,
                            ) ?? String(ev.date).split("T")[0],
                          time_from: String(ev.time_from),
                          time_to: String(ev.time_to),
                        },
                        tenantTimezone || undefined,
                        orgTimeDateFnsPattern(timeFormat),
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showTeaching && (
        <Link
          href={`/users/${userId}?section=academic&pane=courses`}
          className={cn(
            "group flex min-w-[10rem] flex-1 flex-col gap-0.5 rounded-md transition-colors",
            "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={`${teachingHeading}: ${teachingCoursesCount}. ${teachingSub}`}
        >
          <span className="text-xs font-medium text-text-muted">
            {teachingHeading}
          </span>
          <span className="text-2xl font-semibold tabular-nums tracking-tight text-text-primary underline-offset-4 group-hover:underline">
            {teachingCoursesCount}
          </span>
          <span className="text-xs text-text-muted">{teachingSub}</span>
        </Link>
      )}
    </div>
  );
}
