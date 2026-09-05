import { makePostRequest } from "@/app/client-api/utils";
import {
  formatOrgTime,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";
import { assertSchedjuiceSuccess } from "@/lib/schedjuice-api-response";
import type {
  CourseInsightsIssue,
  OverlapFixApplyResponse,
  OverlapFixPreviewResponse,
  OverlapRescheduleApplyResponse,
  OverlapReschedulePreviewResponse,
} from "@/types/course-insights";

export const COURSE_INSIGHTS_ISSUE_LABELS: Record<CourseInsightsIssue, string> = {
  no_schedule: "No schedule",
  overlapping_events: "Overlapping sessions",
  no_students: "No students",
  no_main_teacher: "No MT",
  no_assistant_teacher: "No AT",
  missing_session_data: "Missing session data",
};

export const COURSE_INSIGHTS_ISSUE_BADGE_CLASS: Record<
  CourseInsightsIssue,
  string
> = {
  no_schedule: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
  overlapping_events: "bg-orange-500/10 text-orange-800 dark:text-orange-200",
  no_students: "bg-rose-500/10 text-rose-800 dark:text-rose-200",
  no_main_teacher: "bg-violet-500/10 text-violet-800 dark:text-violet-200",
  no_assistant_teacher: "bg-purple-500/10 text-purple-800 dark:text-purple-200",
  missing_session_data: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
};

export async function fetchOverlapFixPreview(
  courseId: number,
): Promise<OverlapFixPreviewResponse> {
  const res = await makePostRequest(
    `courses/${courseId}/data-health/fix-overlapping-events/preview`,
    {},
  );
  return { data: assertSchedjuiceSuccess(res) };
}

export async function applyOverlapFix(
  courseId: number,
): Promise<OverlapFixApplyResponse> {
  const res = await makePostRequest(
    `courses/${courseId}/data-health/fix-overlapping-events/apply`,
    {},
  );
  return { data: assertSchedjuiceSuccess(res) };
}

export async function fetchOverlapReschedulePreview(
  courseId: number,
): Promise<OverlapReschedulePreviewResponse> {
  const res = await makePostRequest(
    `courses/${courseId}/data-health/reschedule-overlapping-events/preview`,
    {},
  );
  return { data: assertSchedjuiceSuccess(res) };
}

export async function applyOverlapReschedule(
  courseId: number,
  body: { event_ids: number[]; time_from: string; time_to: string },
): Promise<OverlapRescheduleApplyResponse> {
  const res = await makePostRequest(
    `courses/${courseId}/data-health/reschedule-overlapping-events/apply`,
    body,
  );
  return { data: assertSchedjuiceSuccess(res) };
}

export function formatOverlapSessionTime(
  value: string,
  format: TimeDisplayFormatValue = "12h",
): string {
  return formatOrgTime(value, format);
}
