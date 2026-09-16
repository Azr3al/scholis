import { describe, expect, it } from "vitest";
import {
  buildCombinedOrgFormData,
  pickOrgSectionValues,
  validateOrgSectionsForSave,
} from "./build-org-section-payload";

describe("pickOrgSectionValues", () => {
  it("picks only keys for the microsoft section", () => {
    const all = {
      name: "School",
      is_microsoft_on: true,
      app_id: "abc",
      timezone: "Asia/Yangon",
    };
    const picked = pickOrgSectionValues("microsoft", all);
    expect(picked).toEqual({ is_microsoft_on: true, app_id: "abc" });
    expect(picked).not.toHaveProperty("name");
    expect(picked).not.toHaveProperty("timezone");
  });

  it("includes is_wd_we_course_types_enabled in courses", () => {
    const all = {
      report_style: "default",
      is_fm_hm_course_display_enabled: true,
      is_wd_we_course_types_enabled: true,
      timezone: "Asia/Yangon",
    };
    const picked = pickOrgSectionValues("courses", all);
    expect(picked.is_wd_we_course_types_enabled).toBe(true);
    expect(picked).not.toHaveProperty("timezone");
  });

  it("picks invoicing payment plan fields", () => {
    const all = {
      default_student_payment_plan: "single_month",
      is_payment_plan_mandatory: true,
      timezone: "Asia/Yangon",
    };
    const picked = pickOrgSectionValues("invoicing", all);
    expect(picked.default_student_payment_plan).toBe("single_month");
    expect(picked.is_payment_plan_mandatory).toBe(true);
  });

  it("combines dirty sections into one form payload", () => {
    const values = {
      name: "School",
      timezone: "Asia/Yangon",
      is_wd_we_course_types_enabled: false,
    };
    const formData = buildCombinedOrgFormData(
      ["profile", "region-time"],
      values,
    );
    expect(formData.get("name")).toBe("School");
    expect(formData.get("timezone")).toBe("Asia/Yangon");
    expect(formData.has("is_wd_we_course_types_enabled")).toBe(false);
  });

  it("blocks combined save when microsoft validation fails", () => {
    const error = validateOrgSectionsForSave(
      ["microsoft"],
      { is_microsoft_on: true },
      {
        wasMicrosoftOnAtLoad: false,
        wasTelegramOnAtLoad: false,
        hasConnectedBot: false,
      },
    );
    expect(error).toMatch(/Microsoft/i);
  });
});
