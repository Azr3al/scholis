"use client";
import { Button, Popover, buttonVariants } from "@/components/primitives";

import { cn } from "@/lib/utils";
import { formatSessionClock } from "@/helpers/date";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";
import { discriminateMeetingLink } from "@/helpers/discriminate-meeting-link";
import { groupByTimeFrom } from "@/helpers/shortcuts-event-buckets";
import {
  PrimaryTeacherLine,
  type PrimaryTeacherDisplay,
} from "@/components/course/primary-teacher-line";
import { coursePrimaryTeacherForDisplay } from "@/helpers/course-primary-teacher-display";
import type { courseType } from "@/types/course";
import Image from "next/image";
import { OpenNewWindow as ExternalLink } from "iconoir-react";
import Link from "next/link";
import { useMemo } from "react";

export type ShortcutSessionEventRow = {
  id: number;
  title: string;
  date: string;
  time_from: string;
  time_to: string;
  course:
    | (courseType & { primary_teacher?: PrimaryTeacherDisplay | null })
    | number;
};

const MAX_VISIBLE_IN_GROUP = 6;

export function getCourseTitle(course: ShortcutSessionEventRow["course"]): string {
  if (course && typeof course === "object" && "title" in course) {
    return course.title;
  }
  return "Course";
}

export function getCourseId(
  course: ShortcutSessionEventRow["course"],
): number | null {
  if (course && typeof course === "object" && "id" in course) {
    return course.id as number;
  }
  return null;
}

function getMeetingLink(course: ShortcutSessionEventRow["course"]): string | null {
  if (course && typeof course === "object" && "meeting_link" in course) {
    const l = (course as courseType).meeting_link;
    return l && String(l).trim() ? String(l) : null;
  }
  return null;
}

function getPrimaryTeacher(
  course: ShortcutSessionEventRow["course"],
): PrimaryTeacherDisplay | null {
  if (course && typeof course === "object" && course.primary_teacher) {
    return coursePrimaryTeacherForDisplay(
      course.primary_teacher,
      course.main_teacher_count,
    );
  }
  return null;
}

function EventGroupRow({
  timeKey,
  events,
}: {
  timeKey: string;
  events: ShortcutSessionEventRow[];
}) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const visible = events.slice(0, MAX_VISIBLE_IN_GROUP);
  const overflow = events.slice(MAX_VISIBLE_IN_GROUP);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start border-b border-border/80 py-4 last:border-0">
      <div className="shrink-0 w-28 text-sm font-medium text-text-muted tabular-nums">
        {formatSessionClock(timeKey, timeFormat)}
      </div>
      <div className="flex flex-1 flex-wrap gap-2 min-w-0">
        {visible.map((ev) => {
          const cid = getCourseId(ev.course);
          const title = getCourseTitle(ev.course);
          const meeting = getMeetingLink(ev.course);
          const primary = getPrimaryTeacher(ev.course);
          return (
            <div
              key={ev.id}
              className="relative min-w-[200px] max-w-[320px] flex-1 rounded-lg border bg-surface-elevated px-3 py-2 text-sm shadow-sm"
            >
              {meeting && (
                <Link
                  href={meeting}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface/90 shadow-sm transition-colors hover:bg-surface-sunken"
                  aria-label="Join meeting"
                >
                  <Image
                    src={discriminateMeetingLink(meeting)}
                    alt="Meeting platform"
                    width={20}
                    height={20}
                    className="size-5 object-contain"
                  />
                </Link>
              )}
              <div className={meeting ? "pr-10" : undefined}>
                <div className="font-medium leading-snug line-clamp-2">{title}</div>
                <div className="text-text-muted text-xs mt-0.5 line-clamp-1">
                  {ev.title}
                </div>
                <div className="text-text-muted text-xs mt-1">
                  {formatSessionClock(ev.time_from, timeFormat)} –{" "}
                  {formatSessionClock(ev.time_to, timeFormat)}
                </div>
                <PrimaryTeacherLine teacher={primary} className="mt-1.5" />
              </div>
              {cid != null && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/courses/${cid}`}
                    className={cn(
                      buttonVariants({ variant: "secondary", size: "sm" }),
                      "gap-1.5"
                    )}
                  >
                    Course
                    <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                  </Link>
                </div>
              )}
            </div>
          );
        })}
        {overflow.length > 0 && (
          <Popover.Root>
            <Popover.Trigger
              type="button"
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "h-9 shrink-0"
              )}
            >
              +{overflow.length} more
            </Popover.Trigger>
            <Popover.Portal>
        <Popover.Positioner align="start">
        <Popover.Popup className="w-80 max-h-72 overflow-y-auto">
              <p className="text-xs font-medium text-text-muted mb-2">
                All sessions at this time
              </p>
              <ul className="space-y-2 text-sm">
                {overflow.map((ev) => {
                  const pt = getPrimaryTeacher(ev.course);
                  return (
                    <li
                      key={ev.id}
                      className="border-b border-border/60 pb-2 last:border-0"
                    >
                      <div className="font-medium">{getCourseTitle(ev.course)}</div>
                      <div className="text-text-muted text-xs">{ev.title}</div>
                      <PrimaryTeacherLine teacher={pt} className="mt-0.5" />
                      {getCourseId(ev.course) != null && (
                        <Link
                          className="text-primary text-xs underline mt-1 inline-block"
                          href={`/courses/${getCourseId(ev.course)}`}
                        >
                          Open course
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
          </Popover.Root>
        )}
      </div>
    </div>
  );
}

export function ShortcutSessionSection({
  title,
  events,
  emptyHint,
}: {
  title: string;
  events: ShortcutSessionEventRow[];
  emptyHint: string;
}) {
  const groups = useMemo(() => groupByTimeFrom(events), [events]);
  const keys = useMemo(
    () => Array.from(groups.keys()).sort((a, b) => a.localeCompare(b)),
    [groups],
  );

  if (events.length === 0) {
    return (
      <div className="rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-1">{title}</h2>
        <p className="text-text-muted text-sm">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border">
      <div className="border-b px-4 py-3 bg-surface-sunken/30">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-text-muted text-xs">{events.length} session(s)</p>
      </div>
      <div className="px-4">
        {keys.map((k) => (
          <EventGroupRow key={k} timeKey={k} events={groups.get(k) ?? []} />
        ))}
      </div>
    </div>
  );
}
