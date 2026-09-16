import { makePostRequest } from "@/app/client-api/utils";
import { weekdayNames } from "@/components/calendar/types";
import { addRecurringEvents } from "@/helpers/calendar";
import { isValidSessionTimeRange } from "@/helpers/session-time";
import { sanitizeCoursePayloadForApiWrite } from "@/helpers/course-program-validation";
import { cleanDatesForBackend } from "@/helpers/date";
import type { eventType } from "@/types/course";
import type { RecurringSlot } from "@/types/intake";
import {
  canSubmitCreate,
  impliedSpan,
  isSessionCreditProgram,
  picksToCreateEvents,
  substitutionReserveCap,
  type SessionCreditPick,
} from "./session-credit-draft";

function nextCalendarDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function validateRecurringSlotsForCreate(
  slots: RecurringSlot[],
  options?: { requireAtLeastOne?: boolean },
): string | null {
  if (!slots.length) {
    return options?.requireAtLeastOne
      ? "Select at least one day for weekly sessions."
      : null;
  }
  for (const slot of slots) {
    if (!slot.weekday || !weekdayNames.includes(slot.weekday)) {
      return "Each session needs a valid weekday.";
    }
    if (!isValidSessionTimeRange(slot.time_from, slot.time_to)) {
      return "Each session needs a valid start and end time.";
    }
  }
  return null;
}

export function expandSlotsToCourseEvents({
  slots,
  startDate,
  endDate,
  title,
}: {
  slots: RecurringSlot[];
  startDate: Date;
  endDate: Date;
  title: string;
}): eventType[] {
  const events: eventType[] = [];
  for (const slot of slots) {
    events.push(
      ...addRecurringEvents(
        startDate,
        endDate,
        [slot.weekday],
        {},
        false,
        title,
        slot.time_from,
        slot.time_to,
      ),
    );
  }
  return events;
}

export type CreateCourseScheduleResult = {
  courseId: number;
  course: Record<string, unknown>;
  scheduleApplied: boolean;
  scheduleError?: string;
};

export async function createCourseThenOptionalSchedule(args: {
  coursePayload: Record<string, unknown>;
  slots: RecurringSlot[];
  title: string;
  startDate: Date;
  endDate: Date;
}): Promise<CreateCourseScheduleResult> {
  const slotError = validateRecurringSlotsForCreate(args.slots);
  if (slotError) throw new Error(slotError);

  const createRes = await makePostRequest("courses", args.coursePayload);
  const course = (createRes?.data?.data ?? {}) as Record<string, unknown>;
  const courseId = course.id as number | undefined;
  if (courseId == null) {
    throw new Error("Course create response missing id");
  }

  if (!args.slots.length) {
    return { courseId, course, scheduleApplied: false };
  }

  const events = expandSlotsToCourseEvents({
    slots: args.slots,
    startDate: args.startDate,
    endDate: args.endDate,
    title: args.title,
  });

  const sanitized = sanitizeCoursePayloadForApiWrite(course);
  const courseForEdit = cleanDatesForBackend(sanitized, [
    "start_date",
    "end_date",
  ]);

  try {
    await makePostRequest(`courses/${courseId}/edit-events`, {
      course: courseForEdit,
      events,
    });
    return { courseId, course, scheduleApplied: true };
  } catch {
    return {
      courseId,
      course,
      scheduleApplied: false,
      scheduleError: "Course created, but sessions could not be added",
    };
  }
}

export async function createCourseThenSessionCreditSchedule(args: {
  coursePayload: Record<string, unknown>;
  picks: SessionCreditPick[];
  title: string;
  allowMultiplePerDay?: boolean;
}): Promise<CreateCourseScheduleResult> {
  const maxSessions = Number(args.coursePayload.max_sessions);
  const draft = {
    maxSessions,
    reserveCap: 0,
    timeFrom: args.picks[0]?.time_from ?? "",
    timeTo: args.picks[0]?.time_to ?? "",
    picks: args.picks,
    capNote: null,
  };
  if (!canSubmitCreate(draft, { allowMultiplePerDay: args.allowMultiplePerDay })) {
    throw new Error("Select exactly the max number of sessions.");
  }
  const span = impliedSpan(args.picks);
  if (!span) throw new Error("Select exactly the max number of sessions.");
  const endDate =
    span.end <= span.start ? nextCalendarDay(span.start) : span.end;

  const payload = {
    ...args.coursePayload,
    max_sessions: maxSessions,
    start_date: span.start,
    end_date: endDate,
  };
  const createRes = await makePostRequest("courses", payload);
  const course = (createRes?.data?.data ?? {}) as Record<string, unknown>;
  const courseId = course.id as number | undefined;
  if (courseId == null) throw new Error("Course create response missing id");

  const events = picksToCreateEvents(args.picks, args.title, {
    allowMultiplePerDay: args.allowMultiplePerDay,
  });
  const sanitized = sanitizeCoursePayloadForApiWrite(course);
  const courseForEdit = {
    ...cleanDatesForBackend(sanitized, ["start_date", "end_date"]),
    max_sessions: maxSessions,
    start_date: span.start,
    end_date: endDate,
  };
  try {
    await makePostRequest(`courses/${courseId}/edit-events`, {
      course: courseForEdit,
      events,
    });
    return { courseId, course, scheduleApplied: true };
  } catch {
    return {
      courseId,
      course,
      scheduleApplied: false,
      scheduleError: "Course created, but sessions could not be added",
    };
  }
}
