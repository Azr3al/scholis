"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Button, buttonVariants } from "@/components/primitives";
import { weekdayNames } from "@/components/calendar/types";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";
import { getDateISOString } from "@/helpers/date";
import { startOfWeek } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";

const DAYS: number[] = [0, 1, 2, 3, 4, 5, 6];
const WEEK_STARTS_ON = 0 as const;
//Map to track week events
const createEmptyWeekMap = (): Record<number, Set<string>> => ({
  0: new Set<string>(),
  1: new Set<string>(),
  2: new Set<string>(),
  3: new Set<string>(),
  4: new Set<string>(),
  5: new Set<string>(),
  6: new Set<string>(),
});
const getWeekStartISO = (date: Date) => {
  const sow = startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
  sow.setHours(0, 0, 0, 0);
  return getDateISOString(sow);
};

interface TeacherScheduleBadgesProps {
  courseId: string | number;
  userId?: number;
  events?: any[];
}

const TeacherScheduleBadges: React.FC<TeacherScheduleBadgesProps> = ({
  courseId,
  userId,
  events,
}) => {
  // fetch all course events
  const { data: courseEventsData } = useQuery({
    queryKey: ["courseEventsForBadges", courseId],
    enabled: !events,
    queryFn: () =>
      searchEntities(
        "events",
        { size: -1 },
        {
          filter_params: [
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: String(courseId),
            },
          ],
        }
      ),
  });

  const { data: userEventsData } = useQuery({
    queryKey: ["userEventsForBadges", courseId, userId],
    enabled: !!userId,
    queryFn: () =>
      searchEntities(
        "user-events",
        { size: -1, expand: ["event"] },
        {
          filter_params: [
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: String(userId),
            },
          ],
        }
      ),
  });
  // Calculate what to do
  const content = useMemo(() => {
    const courseEvents = events || courseEventsData?.data?.data || [];
    const courseDateIsos = new Set<string>();
    const courseDays = new Set<number>();
    const courseWeeksByDay = createEmptyWeekMap();

    courseEvents.forEach((e: any) => {
      const iso = getDateISOString(new Date(e.date));
      courseDateIsos.add(iso);
      const d = new Date(iso);
      const day = d.getDay();
      courseDays.add(day);
      courseWeeksByDay[day].add(getWeekStartISO(d));
    });

    if (!userId || courseDateIsos.size === 0) {
      return (
        <Link
          href={`/users/${userId}?tab=schedule`}
          className={cn(buttonVariants({ variant: "primary" }))}
        >
          Show schedule
        </Link>
      );
    }

    const userEvents: any[] = userEventsData?.data?.data || [];
    const userAssignedIsos = new Set<string>();
    userEvents.forEach((ue) => {
      const ev = ue.event;
      if (!ev) return;
      const cid = typeof ev.course === "object" ? ev.course?.id : ev.course;
      if (cid && String(cid) !== String(courseId)) return;
      userAssignedIsos.add(getDateISOString(new Date(ev.date)));
    });

    const userWeeksByDay = createEmptyWeekMap();
    Array.from(userAssignedIsos).forEach((iso) => {
      if (!courseDateIsos.has(iso)) return;
      const d = new Date(iso);
      userWeeksByDay[d.getDay()].add(getWeekStartISO(d));
    });

    const isAllDay =
      courseDays.size > 0 &&
      DAYS.every((d) => {
        if (!courseDays.has(d)) return true;
        const expectedWeeks = courseWeeksByDay[d];
        const coveredWeeks = userWeeksByDay[d];
        return (
          expectedWeeks.size > 0 &&
          expectedWeeks.size ===
            Array.from(coveredWeeks).filter((wk) => expectedWeeks.has(wk))
              .length
        );
      });
    if (isAllDay) {
      return (
        <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary capitalize">
          all day
        </span>
      );
    }

    const fullDays = new Set<number>();
    const partialDays = new Set<number>();
    let anyAssigned = false;

    DAYS.forEach((d) => {
      if (!courseDays.has(d)) return;
      const expectedWeeks = courseWeeksByDay[d];
      if (expectedWeeks.size === 0) return;
      const coveredWeeks = new Set(
        Array.from(userWeeksByDay[d]).filter((wk) => expectedWeeks.has(wk))
      );
      if (coveredWeeks.size > 0) anyAssigned = true;
      const missing = expectedWeeks.size - coveredWeeks.size;
      if (missing === 0 && coveredWeeks.size > 0) fullDays.add(d);
      else if (missing === 1 && coveredWeeks.size > 0) partialDays.add(d);
    });

    if (!anyAssigned) {
      return (
        <Link
          href={`/users/${userId}?tab=schedule`}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          Show schedule
        </Link>
      );
    }

    // Show badges
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {DAYS.map((d) => {
            const isCourseDay = courseDays.has(d);
            return (
              <span
                key={d}
                className={cn({
                  "inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-text-secondary w-6 justify-center text-xs": true,
                  "bg-warning ": isCourseDay && partialDays.has(d),
                  "bg-primary text-primary-foreground": isCourseDay && fullDays.has(d),
                })}
              >
                {weekdayNames[d].charAt(0)}
              </span>
            );
          })}
        </div>
        {partialDays.size > 0 && (
          <Link
            href={`/users/${userId}?tab=schedule`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            *See Full Schedule
          </Link>
        )}
      </div>
    );
  }, [courseId, userId, events, courseEventsData, userEventsData]);

  return content;
};

export default TeacherScheduleBadges;
