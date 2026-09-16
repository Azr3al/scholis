import { describe, expect, it } from "vitest";
import { resolveStaticTextSlotValue, resolveTextSlotValue } from "@/lib/id-card/template-field-values";
import type { CardViewModel } from "@/lib/id-card/types";
import {
  IdCardSlotType,
  IdCardTemplateAudience,
  IdCardTextSlotField,
  type IdCardTemplateSummary,
  type IdCardTextSlot,
} from "@/types/id-card-template";

const vm: CardViewModel = {
  name: "Min Khant Naing",
  email: "min@school.edu",
  roleLabel: "Student",
  role: "student",
  accent: "#005",
  photoUrl: null,
  initials: "MK",
  orgName: "SDEC",
  orgLogoUrl: null,
  bloodType: null,
  emergency: null,
  verifyToken: "tok",
  verifyCode: null,
  studentId: "00156",
  className: "Year 4 (Room 1)",
  courseTitle: null,
  expiresOn: null,
};

const template: IdCardTemplateSummary = {
  id: 1,
  name: "Classic",
  audience: IdCardTemplateAudience.student,
  width_in: 2.125,
  height_in: 3.375,
  background_url: null,
  slots: [],
  back_background_url: null,
  back_slots: [],
  academic_year: "2026-2027",
  expires_on: "2026-01-31",
};

function textSlot(field: IdCardTextSlotField): IdCardTextSlot {
  return {
    id: field,
    type: IdCardSlotType.text,
    field,
    x: 0,
    y: 0,
    width: 1,
    height: 0.2,
  };
}

describe("resolveTextSlotValue", () => {
  it("maps registration slot to student code", () => {
    expect(
      resolveTextSlotValue(textSlot(IdCardTextSlotField.registration), vm, template),
    ).toBe("00156");
  });

  it("uses template-level academic year and expiry", () => {
    expect(
      resolveTextSlotValue(textSlot(IdCardTextSlotField.academic_year), vm, template),
    ).toBe("2026-2027");
    expect(
      resolveTextSlotValue(textSlot(IdCardTextSlotField.expires), vm, template),
    ).toBe("31.1.2026");
  });

  it("prefers course-derived expiry over template expires_on", () => {
    expect(
      resolveTextSlotValue(
        textSlot(IdCardTextSlotField.expires),
        { ...vm, expiresOn: "2026-12-31" },
        template,
      ),
    ).toBe("31.12.2026");
  });

  it("falls back to template expiry when course expiry is unset", () => {
    expect(
      resolveTextSlotValue(
        textSlot(IdCardTextSlotField.expires),
        { ...vm, expiresOn: null },
        template,
      ),
    ).toBe("31.1.2026");
  });

  it("returns empty string when class is missing", () => {
    expect(
      resolveTextSlotValue(textSlot(IdCardTextSlotField.class), { ...vm, className: null }, template),
    ).toBe("");
  });
});

describe("resolveStaticTextSlotValue", () => {
  it("returns trimmed template copy", () => {
    expect(
      resolveStaticTextSlotValue({
        id: "label",
        type: IdCardSlotType.staticText,
        text: "  Student ID Card  ",
        x: 0,
        y: 0,
        width: 1,
        height: 0.2,
      }),
    ).toBe("Student ID Card");
  });
});
