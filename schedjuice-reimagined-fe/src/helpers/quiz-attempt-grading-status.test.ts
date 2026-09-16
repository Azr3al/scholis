import { describe, expect, it } from "vitest";
import {
  attemptEligibleForBulkRelease,
  attemptEligibleForBulkWaive,
  essayStaffStatusForAttempt,
  EssayGradingReleaseStaffLabel,
} from "@/helpers/quiz-attempt-grading-status";

describe("quiz-attempt-grading-status", () => {
  it("labels pending vs waived vs released", () => {
    expect(
      essayStaffStatusForAttempt(false, {
        has_pending_essay_grading: true,
        essay_grading_waived_at: null,
        is_released: false,
      }),
    ).toBe(EssayGradingReleaseStaffLabel.NotApplicable);

    expect(
      essayStaffStatusForAttempt(true, {
        has_pending_essay_grading: true,
        essay_grading_waived_at: null,
        is_released: false,
      }),
    ).toBe(EssayGradingReleaseStaffLabel.PendingGrading);

    expect(
      essayStaffStatusForAttempt(true, {
        has_pending_essay_grading: true,
        essay_grading_waived_at: "2026-01-01",
        is_released: false,
      }),
    ).toBe(EssayGradingReleaseStaffLabel.Waived);

    expect(
      essayStaffStatusForAttempt(true, {
        has_pending_essay_grading: false,
        essay_grading_waived_at: null,
        is_released: false,
      }),
    ).toBe(EssayGradingReleaseStaffLabel.ReadyToRelease);

    expect(
      essayStaffStatusForAttempt(true, {
        has_pending_essay_grading: false,
        essay_grading_waived_at: null,
        is_released: true,
      }),
    ).toBe(EssayGradingReleaseStaffLabel.Released);
  });

  it("bulk release needs essays graded or waived", () => {
    expect(
      attemptEligibleForBulkRelease(true, {
        has_pending_essay_grading: true,
        essay_grading_waived_at: null,
        is_released: false,
      }),
    ).toBe(false);

    expect(
      attemptEligibleForBulkRelease(true, {
        has_pending_essay_grading: true,
        essay_grading_waived_at: "x",
        is_released: false,
      }),
    ).toBe(true);

    expect(
      attemptEligibleForBulkRelease(true, {
        has_pending_essay_grading: false,
        essay_grading_waived_at: null,
        is_released: false,
      }),
    ).toBe(true);
  });

  it("bulk waive only when pending and not waived", () => {
    expect(
      attemptEligibleForBulkWaive(true, {
        has_pending_essay_grading: true,
        essay_grading_waived_at: null,
      }),
    ).toBe(true);

    expect(
      attemptEligibleForBulkWaive(true, {
        has_pending_essay_grading: false,
        essay_grading_waived_at: null,
      }),
    ).toBe(false);
  });
});
