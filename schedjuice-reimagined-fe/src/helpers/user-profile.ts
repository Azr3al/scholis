import { format, parseISO } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";

import { courseStatus, seniorityEnum } from "@/types/course";
import { getTimeslotUtcRange } from "@/helpers/timeslot";

export function getTenantTodayDateString(tenantTimezone?: string | null): string {
  const zone = tenantTimezone || "UTC";
  const zoned = utcToZonedTime(new Date(), zone);
  return format(zoned, "yyyy-MM-dd");
}

/**
 * Calendar yyyy-MM-dd for a class session in the tenant timezone.
 * Handles plain date strings and full ISO datetimes from the API.
 */
export function eventDateToTenantCalendarDay(
  dateRaw: string | undefined | null,
  tenantTimezone?: string | null
): string | null {
  if (!dateRaw) return null;
  const s = String(dateRaw).trim();
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(s);
  if (dateOnly) return dateOnly[1];

  const tz = tenantTimezone || "UTC";
  try {
    const d = parseISO(s);
    if (Number.isNaN(d.getTime())) {
      return s.split("T")[0] || null;
    }
    return format(utcToZonedTime(d, tz), "yyyy-MM-dd");
  } catch {
    return s.split("T")[0] || null;
  }
}

function normalizeTimeField(t: unknown): string | null {
  if (t == null) return null;
  if (typeof t === "string") {
    const x = t.trim();
    return x.length >= 5 ? x : null;
  }
  return null;
}

/** Mirrors backend _assigned_role_seniority_populated for user_courses[].assigned_as_role */
export function assignedRoleSeniorityCountsForTeachingStat(
  seniority: string | null | undefined
): boolean {
  if (seniority == null || String(seniority).trim() === "") return false;
  return seniority !== seniorityEnum.OTHER;
}

function courseIdFromUserCourse(uc: {
  course?: number | { id?: number; status?: string };
}): number | null {
  const c = uc.course;
  if (c == null) return null;
  return typeof c === "object" ? (c.id ?? null) : c;
}

function courseStatusFromUserCourse(uc: {
  course?: number | { id?: number; status?: string };
}): string | null {
  const c = uc.course;
  if (c == null || typeof c !== "object") return null;
  return c.status ?? null;
}

/**
 * Distinct planned + active courses where the user's role seniority is populated and not OTHER.
 * Returns null if there is no qualifying assignment (caller hides the stat).
 */
export function countTeachingAssignmentsDistinctCourses(
  userCourses: unknown[] | null | undefined
): number | null {
  if (!userCourses?.length) return null;

  const qualifyingIds = new Set<number>();
  let anySeniorityEligibleRow = false;

  for (const uc of userCourses) {
    const row = uc as {
      course?: number | { id?: number; status?: string };
      assigned_as_role?: { seniority?: string | null } | null;
    };
    const seniority = row.assigned_as_role?.seniority;
    if (!assignedRoleSeniorityCountsForTeachingStat(seniority)) continue;

    anySeniorityEligibleRow = true;
    const cid = courseIdFromUserCourse(row);
    const st = courseStatusFromUserCourse(row);
    if (cid == null) continue;
    if (st !== courseStatus.planned && st !== courseStatus.active) continue;
    qualifyingIds.add(cid);
  }

  if (!anySeniorityEligibleRow) return null;
  return qualifyingIds.size;
}

export type ProfileCalendarEventLike = {
  id?: string | number;
  date?: string;
  time_from?: string;
  time_to?: string;
  type?: string;
  title?: string;
  courseTitle?: string;
  /** Course id (number) or expanded object from API — used for links to `/courses/[id]` */
  course?: number | string | { id?: number; title?: string };
};

/** Human-readable course name from a profile event's `course` field. */
export function profileEventCourseLabel(
  course: ProfileCalendarEventLike["course"],
): string | null {
  if (course == null || typeof course !== "object") return null;
  const title = course.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return null;
}

/** Safe display label for calendar / profile session rows — never returns an object. */
export function profileEventDisplayTitle(
  event: ProfileCalendarEventLike,
  fallback = "Class session",
): string {
  if (event.courseTitle?.trim()) return event.courseTitle.trim();

  const courseLabel = profileEventCourseLabel(event.course);
  if (courseLabel) return courseLabel;

  const title = event.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  if (typeof title === "object" && title != null && "title" in title) {
    const nested = (title as { title?: unknown }).title;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }

  return fallback;
}

/** Resolve course id from merged calendar / profile events for navigation */
export function courseIdFromProfileEvent(
  e: ProfileCalendarEventLike
): number | null {
  const c = e.course;
  if (c == null) return null;
  if (typeof c === "number" && Number.isFinite(c)) return c;
  if (typeof c === "string") {
    const n = Number(String(c).trim());
    return Number.isFinite(n) ? n : null;
  }
  if (typeof c === "object" && c.id != null && Number.isFinite(Number(c.id))) {
    return Number(c.id);
  }
  return null;
}

/**
 * Course search rows are full Course objects `{ id, title, events }`, not user_course rows.
 * User-course rows use nested `course` — support both.
 */
function courseIdFromCourseSearchRow(row: {
  id?: unknown;
  course?: number | { id?: number; status?: string };
}): number | null {
  const rid = row?.id;
  if (typeof rid === "number" && Number.isFinite(rid)) return rid;
  if (rid != null && typeof rid !== "object") {
    const n = Number(rid);
    if (Number.isFinite(n)) return n;
  }
  return courseIdFromUserCourse(row);
}

export function isProfileEventOngoingNow(
  event: ProfileCalendarEventLike,
  now: Date,
  tenantTimezone?: string | null
): boolean {
  const timeFrom = normalizeTimeField(event.time_from);
  const timeTo = normalizeTimeField(event.time_to);
  if (!event.date || !timeFrom || !timeTo) return false;
  if (
    event.type === "assignment_available" ||
    event.type === "assignment_due"
  ) {
    return false;
  }

  const calendarDay = eventDateToTenantCalendarDay(
    typeof event.date === "string" ? event.date : String(event.date),
    tenantTimezone
  );
  const todayStr = getTenantTodayDateString(tenantTimezone);
  if (!calendarDay || calendarDay !== todayStr) return false;

  try {
    const { utcStart, utcEnd } = getTimeslotUtcRange(
      {
        date: calendarDay,
        time_from: timeFrom,
        time_to: timeTo,
      },
      tenantTimezone || undefined
    );
    return (
      now.getTime() >= utcStart.getTime() && now.getTime() <= utcEnd.getTime()
    );
  } catch {
    return false;
  }
}

export function getOngoingProfileEvents(
  events: ProfileCalendarEventLike[],
  tenantTimezone?: string | null,
  now: Date = new Date()
): ProfileCalendarEventLike[] {
  return events.filter((e) => isProfileEventOngoingNow(e, now, tenantTimezone));
}

/** In-session class rows shown on the profile — always carry a course id for `/courses/[id]`. */
export type ProfileOngoingSession = ProfileCalendarEventLike & {
  courseId: number;
};

/**
 * Ongoing class sessions only; drops rows with no resolvable course id (should not happen for
 * staff events or enrollment-backed events once `course` is normalized).
 */
export function getOngoingProfileSessionsWithCourse(
  events: ProfileCalendarEventLike[],
  tenantTimezone?: string | null,
  now: Date = new Date()
): ProfileOngoingSession[] {
  const out: ProfileOngoingSession[] = [];
  for (const e of events) {
    if (!isProfileEventOngoingNow(e, now, tenantTimezone)) continue;
    const courseId = courseIdFromProfileEvent(e);
    if (courseId == null) continue;
    out.push({ ...e, courseId });
  }
  return out;
}

/** Course search rows with expanded `events` → flat list for calendar / ongoing checks */
export function flattenCourseEventsFromCoursesQuery(
  coursesData: unknown[] | undefined | null
): ProfileCalendarEventLike[] {
  if (!coursesData?.length) return [];
  return coursesData.flatMap((row: any) => {
    const cid = courseIdFromCourseSearchRow(row);
    const rowTitle = typeof row.title === "string" ? row.title : undefined;
    return (row.events || []).map((e: any) => ({
      ...e,
      courseTitle: rowTitle,
      course:
        cid != null
          ? { id: cid, title: rowTitle }
          : rowTitle != null
            ? { title: rowTitle }
            : undefined,
    }));
  });
}
