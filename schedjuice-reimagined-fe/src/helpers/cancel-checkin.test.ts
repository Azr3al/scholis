import { describe, expect, it } from "vitest";
import {
  CancelCheckinReason,
  canCancelTeacherCheckin,
  isCancelCheckinSubmitEnabled,
} from "@/helpers/cancel-checkin";

describe("canCancelTeacherCheckin", () => {
  it("is false when org flag is off or tenant is missing", () => {
    expect(canCancelTeacherCheckin(null)).toBe(false);
    expect(canCancelTeacherCheckin(undefined)).toBe(false);
    expect(canCancelTeacherCheckin({ allow_teacher_checkin_cancellation: false })).toBe(
      false,
    );
  });

  it("is true when org flag is on", () => {
    expect(canCancelTeacherCheckin({ allow_teacher_checkin_cancellation: true })).toBe(
      true,
    );
  });
});

describe("isCancelCheckinSubmitEnabled", () => {
  it("requires a valid reason code", () => {
    expect(isCancelCheckinSubmitEnabled("invalid", "")).toBe(false);
  });

  it("allows preset reasons without a note", () => {
    expect(isCancelCheckinSubmitEnabled(CancelCheckinReason.StudentNoShow, "")).toBe(
      true,
    );
    expect(
      isCancelCheckinSubmitEnabled(CancelCheckinReason.CheckedInByMistake, ""),
    ).toBe(true);
  });

  it("requires a note for other", () => {
    expect(isCancelCheckinSubmitEnabled(CancelCheckinReason.Other, "")).toBe(false);
    expect(isCancelCheckinSubmitEnabled(CancelCheckinReason.Other, "  ")).toBe(false);
    expect(
      isCancelCheckinSubmitEnabled(CancelCheckinReason.Other, "Student arrived late"),
    ).toBe(true);
  });

  it("rejects notes over 500 characters", () => {
    expect(
      isCancelCheckinSubmitEnabled(CancelCheckinReason.StudentNoShow, "x".repeat(501)),
    ).toBe(false);
  });
});
