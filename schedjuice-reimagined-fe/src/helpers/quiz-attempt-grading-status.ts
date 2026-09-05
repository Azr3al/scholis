import type { QuizAttemptListRow } from "@/helpers/quiz-attempts-filters";

export enum EssayGradingReleaseStaffLabel {
  NotApplicable = "not_applicable",
  PendingGrading = "pending_grading",
  Waived = "waived",
  ReadyToRelease = "ready_to_release",
  Released = "released",
}

export function essayStaffStatusForAttempt(
  hasEssayQuestions: boolean,
  row: Pick<
    QuizAttemptListRow,
    | "has_pending_essay_grading"
    | "essay_grading_waived_at"
    | "is_released"
  >,
): EssayGradingReleaseStaffLabel {
  if (!hasEssayQuestions) return EssayGradingReleaseStaffLabel.NotApplicable;
  if (row.is_released) return EssayGradingReleaseStaffLabel.Released;
  if (row.has_pending_essay_grading && !row.essay_grading_waived_at) {
    return EssayGradingReleaseStaffLabel.PendingGrading;
  }
  if (row.essay_grading_waived_at) return EssayGradingReleaseStaffLabel.Waived;
  return EssayGradingReleaseStaffLabel.ReadyToRelease;
}

export function essayStaffStatusLabel(status: EssayGradingReleaseStaffLabel): string {
  switch (status) {
    case EssayGradingReleaseStaffLabel.NotApplicable:
      return "—";
    case EssayGradingReleaseStaffLabel.PendingGrading:
      return "Needs essay grade";
    case EssayGradingReleaseStaffLabel.Waived:
      return "Waived (0)";
    case EssayGradingReleaseStaffLabel.ReadyToRelease:
      return "Ready to release";
    case EssayGradingReleaseStaffLabel.Released:
      return "Released";
    default:
      return "—";
  }
}

/** Attempt can be selected for bulk release when essays are done or waived and not already released. */
export function attemptEligibleForBulkRelease(
  hasEssayQuestions: boolean,
  row: Pick<
    QuizAttemptListRow,
    "has_pending_essay_grading" | "essay_grading_waived_at" | "is_released"
  >,
): boolean {
  if (!hasEssayQuestions || row.is_released) return false;
  if (!row.has_pending_essay_grading) return true;
  return row.essay_grading_waived_at != null;
}

export function attemptEligibleForBulkWaive(
  hasEssayQuestions: boolean,
  row: Pick<
    QuizAttemptListRow,
    "has_pending_essay_grading" | "essay_grading_waived_at"
  >,
): boolean {
  return (
    hasEssayQuestions &&
    row.has_pending_essay_grading === true &&
    row.essay_grading_waived_at == null
  );
}
