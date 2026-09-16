import { describe, expect, it } from "vitest";
import { PaymentAssignmentMonthUiStatus } from "@/components/finances/student-payments-report";
import {
  shouldShowTeamsPaymentAssignmentStatus,
  teamsPaymentHandInLabel,
} from "./teams-payment-assignment-status";

describe("teamsPaymentHandInLabel", () => {
  it("maps all known statuses to prior copy", () => {
    expect(teamsPaymentHandInLabel(PaymentAssignmentMonthUiStatus.Created)).toBe(
      "Teams payment: CREATED",
    );
    expect(
      teamsPaymentHandInLabel(PaymentAssignmentMonthUiStatus.ExpectedButMissing),
    ).toBe("Teams payment: EXPECTED BUT MISSING");
    expect(
      teamsPaymentHandInLabel(PaymentAssignmentMonthUiStatus.Scheduled, {
        creationWindowStart: "2026-08-20",
      }),
    ).toBe("Teams payment: Scheduled (creates Aug 20, 2026)");
    expect(teamsPaymentHandInLabel(PaymentAssignmentMonthUiStatus.Scheduled)).toBe(
      "Teams payment: Scheduled",
    );
    expect(
      teamsPaymentHandInLabel(PaymentAssignmentMonthUiStatus.Missed, {
        creationWindowEnd: "2026-02-28",
      }),
    ).toBe("Teams payment: MISSED (window closed Feb 28, 2026)");
    expect(teamsPaymentHandInLabel(PaymentAssignmentMonthUiStatus.Missed)).toBe(
      "Teams payment: MISSED",
    );
    expect(teamsPaymentHandInLabel(PaymentAssignmentMonthUiStatus.Skipped)).toBe(
      "Teams payment: NOT YET",
    );
    expect(
      teamsPaymentHandInLabel(PaymentAssignmentMonthUiStatus.NotApplicable),
    ).toBe("Teams payment hand-in does not apply to this class.");
  });

  it("returns fallback for unknown status", () => {
    expect(teamsPaymentHandInLabel("bogus")).toBe(
      "Could not determine Teams payment hand-in status.",
    );
  });
});

describe("shouldShowTeamsPaymentAssignmentStatus", () => {
  it("is false when Microsoft is off", () => {
    expect(
      shouldShowTeamsPaymentAssignmentStatus({
        isMicrosoftOn: false,
        courseId: "42",
      }),
    ).toBe(false);
  });

  it("is false when course id is missing or invalid", () => {
    expect(
      shouldShowTeamsPaymentAssignmentStatus({
        isMicrosoftOn: true,
        courseId: "",
      }),
    ).toBe(false);
    expect(
      shouldShowTeamsPaymentAssignmentStatus({
        isMicrosoftOn: true,
        courseId: "abc",
      }),
    ).toBe(false);
  });

  it("is true when Microsoft is on and course id is valid", () => {
    expect(
      shouldShowTeamsPaymentAssignmentStatus({
        isMicrosoftOn: true,
        courseId: "42",
      }),
    ).toBe(true);
  });
});
