import { describe, expect, it } from "vitest";
import { ConsultationClassPreference } from "@/types/consultation";
import {
  buildLwtpBookingDetails,
  formatClassPreferenceLabel,
  formatExamTargetForSubmit,
  formatPhoneForSubmit,
  validateLwtpBookingForm,
  type LwtpBookingFormValues,
} from "@/lib/consultation/lwtp-booking-fields";

function baseValues(
  overrides: Partial<LwtpBookingFormValues> = {},
): LwtpBookingFormValues {
  return {
    student_name: "Student",
    student_email: "student@example.com",
    myanmar_name: "U Student",
    class_preference: ConsultationClassPreference.GroupClass,
    phoneDialCode: "+95",
    phoneNumber: "",
    telegram_username: "",
    examTargetDate: undefined,
    exam_board: "CIE",
    subjectIds: [1],
    subjectOtherChecked: false,
    subject_other: "",
    ...overrides,
  };
}

describe("validateLwtpBookingForm", () => {
  it("requires class preference", () => {
    expect(
      validateLwtpBookingForm(
        baseValues({ class_preference: "", subjectIds: [], subjectOtherChecked: true, subject_other: "Custom" }),
      ),
    ).toBe("Select a class preference.");
  });

  it("requires at least one subject or other", () => {
    expect(
      validateLwtpBookingForm(
        baseValues({ subjectIds: [], subjectOtherChecked: false }),
      ),
    ).toBe("Select at least one subject or choose Other.");
  });

  it("requires other text when other is checked", () => {
    expect(
      validateLwtpBookingForm(
        baseValues({ subjectIds: [], subjectOtherChecked: true, subject_other: "" }),
      ),
    ).toBe("Describe the other subject.");
  });

  it("accepts a valid lwtp payload", () => {
    expect(validateLwtpBookingForm(baseValues())).toBeNull();
  });
});

describe("buildLwtpBookingDetails", () => {
  it("normalizes phone and telegram", () => {
    const details = buildLwtpBookingDetails(
      baseValues({
        phoneNumber: "912345678",
        telegram_username: "@student",
        examTargetDate: new Date(2026, 5, 1),
      }),
    );

    expect(details.phone).toBe("+95912345678");
    expect(details.telegram_username).toBe("student");
    expect(details.exam_target).toBe("June 2026");
    expect(details.subject_ids).toEqual([1]);
  });
});

describe("formatClassPreferenceLabel", () => {
  it("maps known enum values", () => {
    expect(
      formatClassPreferenceLabel(ConsultationClassPreference.PremiumOneOnOne),
    ).toContain("Premium one on one");
  });
});

describe("formatPhoneForSubmit", () => {
  it("returns empty when number is blank", () => {
    expect(formatPhoneForSubmit("+95", "   ")).toBe("");
  });
});

describe("formatExamTargetForSubmit", () => {
  it("formats month and year for booking details", () => {
    expect(formatExamTargetForSubmit(new Date(2026, 0, 15))).toBe("January 2026");
    expect(formatExamTargetForSubmit(undefined)).toBe("");
  });
});
