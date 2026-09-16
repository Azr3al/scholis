import { hasAdminCredentials } from "@/helpers/authorization";
import {
  isDateRangePreset,
  type DateRangePreset,
} from "@/helpers/date-range-presets";
import { SubmissionTrackerAssessmentKind } from "@/types/submission-tracker";
import type { accountType } from "@/types/user";

export function canAccessSubmissionTracker(
  user: accountType | null | undefined,
) {
  return !!user && hasAdminCredentials(user);
}

export const SUBMISSION_TRACKER_MIN_MISSED_DEFAULT = 3;

export const SUBMISSION_TRACKER_DATE_PRESETS = [
  "last30d",
  "month",
  "last3m",
  "week",
  "custom",
] as const satisfies readonly DateRangePreset[];

const TRACKER_DATE_PRESET_SET = new Set<DateRangePreset>(
  SUBMISSION_TRACKER_DATE_PRESETS,
);

export function presetForSubmissionTracker(
  raw: string | null,
): DateRangePreset {
  if (isDateRangePreset(raw) && TRACKER_DATE_PRESET_SET.has(raw)) return raw;
  return "last30d";
}

export const SUBMISSION_TRACKER_PAGE_SIZE = 25;

export function submissionTrackerAssessmentHref(
  kind: SubmissionTrackerAssessmentKind | string,
  assessmentId: number,
): string {
  return kind === SubmissionTrackerAssessmentKind.Quiz
    ? `/quizzes-v3/${assessmentId}/responses`
    : `/assignments/${assessmentId}`;
}
