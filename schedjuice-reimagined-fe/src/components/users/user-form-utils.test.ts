import { describe, expect, it, vi } from "vitest";

vi.mock("@/helpers/date", () => ({
  getDateISOString: (d: Date) => d.toISOString().slice(0, 10),
}));

import {
  hydrateUserForForm,
  normalizeCountryToCode,
  normalizeCustomDataForSubmit,
  pickIdentityFormValues,
  pickPublicProfileSavePayload,
  prepareUserFormPayload,
  USER_CREATE_IDENTITY_KEYS,
} from "./user-form-utils";
import { collectGroupPayload } from "@/lib/custom-fields/completion";
import type { FormConfigField } from "@/types/form-config";

function customField(
  partial: Partial<FormConfigField> & Pick<FormConfigField, "fieldKey" | "fieldType">
): FormConfigField {
  return {
    id: 1,
    source: "custom",
    fieldLabel: partial.fieldKey,
    choices: null,
    description: "",
    requiredAt: "profile_completion",
    filledBy: "both",
    isFilterable: false,
    sortOrder: 0,
    validationRules: null,
    groupId: null,
    ...partial,
  };
}

describe("normalizeCountryToCode", () => {
  it("maps country name to ISO code", () => {
    expect(normalizeCountryToCode("Myanmar")).toBe("MM");
    expect(normalizeCountryToCode("myanmar")).toBe("MM");
  });

  it("keeps existing ISO codes", () => {
    expect(normalizeCountryToCode("MM")).toBe("MM");
    expect(normalizeCountryToCode("US")).toBe("US");
  });

  it("passes through unknown values", () => {
    expect(normalizeCountryToCode("Narnia")).toBe("Narnia");
  });
});

describe("hydrateUserForForm", () => {
  it("normalizes country names to ISO codes", () => {
    const hydrated = hydrateUserForForm({ country: "Myanmar" } as never);
    expect(hydrated.country).toBe("MM");
  });
});

describe("pickIdentityFormValues", () => {
  it("keeps only step-one identity keys", () => {
    const data = {
      name: "Alex Rivera",
      microsoft_display_name: "Alex R.",
      email: "alex@example.com",
      communication_email: "alex@example.com",
      phone_number: "+1 555 0100",
      roles: ["teacher"],
      code: "T-42",
      gender: "MALE",
      custom_data: { shirt: "L" },
      date_of_birth: "2000-01-01",
    };

    const picked = pickIdentityFormValues(data);

    expect(Object.keys(picked).sort()).toEqual([...USER_CREATE_IDENTITY_KEYS].sort());
    expect(picked).toEqual({
      name: "Alex Rivera",
      microsoft_display_name: "Alex R.",
      email: "alex@example.com",
      communication_email: "alex@example.com",
      phone_number: "+1 555 0100",
      roles: ["teacher"],
      code: "T-42",
    });
    expect(picked).not.toHaveProperty("custom_data");
    expect(picked).not.toHaveProperty("gender");
  });
});

describe("prepareUserFormPayload identity-only create", () => {
  it("builds a create payload without custom_data when skipped", () => {
    const identity = pickIdentityFormValues({
      name: "Alex Rivera",
      email: "alex@example.com",
      communication_email: "alex@example.com",
      phone_number: "+1 555 0100",
      roles: ["teacher"],
      code: "",
      custom_data: { shirt: "L" },
    });

    const payload = prepareUserFormPayload(identity, { mode: "create" });

    expect(payload.password).toBe("Password123$");
    expect(payload).not.toHaveProperty("custom_data");
    expect(payload.name).toBe("Alex Rivera");
    expect(payload.roles).toEqual(["teacher"]);
    expect(payload).not.toHaveProperty("code");
  });

  it("omits microsoft_display_name when tenant is not Microsoft-enabled", () => {
    const payload = prepareUserFormPayload(
      {
        name: "Alex Rivera",
        microsoft_display_name: "Alex R.",
        email: "alex@example.com",
        communication_email: "alex@example.com",
        phone_number: "+1 555 0100",
        roles: ["teacher"],
      },
      { mode: "create", tenant: { is_microsoft_on: false } as never },
    );

    expect(payload).not.toHaveProperty("microsoft_display_name");
  });

  it("keeps microsoft_display_name when tenant is Microsoft-enabled", () => {
    const payload = prepareUserFormPayload(
      {
        name: "Alex Rivera",
        microsoft_display_name: "Alex R.",
        email: "alex@example.com",
        communication_email: "alex@example.com",
        phone_number: "+1 555 0100",
        roles: ["teacher"],
      },
      { mode: "create", tenant: { is_microsoft_on: true } as never },
    );

    expect(payload.microsoft_display_name).toBe("Alex R.");
  });
});

describe("normalizeCustomDataForSubmit", () => {
  it("converts custom date fields to YYYY-MM-DD", () => {
    const fields = [customField({ fieldKey: "started_on", fieldType: "date" })];
    const out = normalizeCustomDataForSubmit(
      { started_on: new Date("2026-06-18T12:00:00.000Z") },
      fields,
    );
    expect(out.started_on).toBe("2026-06-18");
  });

  it("converts custom datetime fields to ISO strings", () => {
    const fields = [customField({ fieldKey: "testing_field", fieldType: "datetime" })];
    const raw = new Date("2026-06-18T00:00:00.000Z");
    const out = normalizeCustomDataForSubmit({ testing_field: raw }, fields);
    expect(out.testing_field).toBe(raw.toISOString());
  });
});

describe("pickPublicProfileSavePayload", () => {
  it("picks only explicit-save keys and omits slug", () => {
    const normalized = prepareUserFormPayload(
      {
        roles: ["teacher"],
        qualifications: { type: "doc", content: [] },
        is_public_profile_enabled: true,
        show_certifications_on_public_profile: false,
        public_profile_slug: "t_abc123",
        name: "Alex Rivera",
      },
      { mode: "edit" },
    );

    expect(pickPublicProfileSavePayload(normalized)).toEqual({
      qualifications: { type: "doc", content: [] },
      is_public_profile_enabled: true,
      show_certifications_on_public_profile: false,
    });
    expect(pickPublicProfileSavePayload(normalized)).not.toHaveProperty(
      "public_profile_slug",
    );
  });
});

describe("prepareUserFormPayload custom_data normalization", () => {
  it("normalizes custom_data when fields are provided", () => {
    const fields = [customField({ fieldKey: "testing_field", fieldType: "datetime" })];
    const raw = new Date("2026-06-18T00:00:00.000Z");
    const payload = prepareUserFormPayload(
      { custom_data: { testing_field: raw } },
      { mode: "edit", fields },
    );
    expect(payload.custom_data).toEqual({ testing_field: raw.toISOString() });
  });

  it("completion sheet pipeline sends normalized custom datetime", () => {
    const fields = [customField({ fieldKey: "testing_field", fieldType: "datetime" })];
    const picked = new Date("2026-06-18T00:00:00.000Z");
    const formValues = { custom_data: { testing_field: picked } };
    const normalized = prepareUserFormPayload(formValues, { mode: "edit", fields });
    expect(collectGroupPayload(fields, normalized)).toEqual({
      custom_data: { testing_field: picked.toISOString() },
    });
  });
});
