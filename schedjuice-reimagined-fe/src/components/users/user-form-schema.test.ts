import { describe, expect, it } from "vitest";

import { buildConfigSchema } from "@/lib/custom-fields/build-config-schema";
import { EMPTY_FORM_CONFIG } from "@/types/form-config";
import type { organizationType } from "@/types/organization";
import {
  accountCreateSchemaObject,
  accountEditSchema,
  getUserSchema,
  withStudentRoleExclusivity,
} from "@/types/user";

const hrEnabledTenant = {
  is_hr_fields_enabled: true,
} as organizationType;

const step2CreateFormData = {
  name: "Alex Rivera",
  email: "alex@example.com",
  communication_email: "alex@example.com",
  phone_number: "+1 555 0100",
  roles: ["teacher"],
  code: "",
  custom_data: {},
};

describe("user create step 2 schema", () => {
  it("passes create schema without gender (regression: silent Add person failure)", () => {
    const createSchema = withStudentRoleExclusivity(
      buildConfigSchema(accountCreateSchemaObject, EMPTY_FORM_CONFIG, "create")
    );

    const result = createSchema.safeParse(step2CreateFormData);
    expect(result.success).toBe(true);
  });

  it("fails edit schema without gender (old composedSchema behavior)", () => {
    const adminUser = { roles: ["admin"] } as Parameters<typeof getUserSchema>[0];
    const editSchema = withStudentRoleExclusivity(
      buildConfigSchema(getUserSchema(adminUser), EMPTY_FORM_CONFIG, "create")
    );

    const result = editSchema.safeParse(step2CreateFormData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "gender")).toBe(
        true
      );
    }
  });

  it("edit schema requires gender on bare accountEditSchema", () => {
    const result = accountEditSchema.safeParse(step2CreateFormData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "gender")).toBe(
        true
      );
    }
  });
});

describe("getUserSchema HR fields", () => {
  it("includes HR keys for admin when tenant HR is enabled", () => {
    const adminUser = { roles: ["admin"] } as Parameters<typeof getUserSchema>[0];
    const schema = getUserSchema(adminUser, hrEnabledTenant);
    expect(Object.keys(schema.shape)).toContain("contract_expiry_date");
    expect(Object.keys(schema.shape)).toContain("employment_type");
  });

  it("excludes HR keys for manager when tenant HR is enabled", () => {
    const managerUser = { roles: ["manager"] } as Parameters<typeof getUserSchema>[0];
    const schema = getUserSchema(managerUser, hrEnabledTenant);
    expect(Object.keys(schema.shape)).not.toContain("contract_expiry_date");
    expect(Object.keys(schema.shape)).not.toContain("employment_type");
  });
});
