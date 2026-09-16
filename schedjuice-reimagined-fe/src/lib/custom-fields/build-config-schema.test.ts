import { describe, expect, it } from "vitest";
import * as z from "zod";
import { buildConfigSchema } from "./build-config-schema";
import type { FormConfig, FormConfigField } from "@/types/form-config";

function field(p: Partial<FormConfigField>): FormConfigField {
  return {
    id: 1,
    source: "custom",
    fieldKey: "k",
    fieldLabel: "K",
    fieldType: "text",
    choices: null,
    description: "",
    requiredAt: "never",
    filledBy: "both",
    isFilterable: false,
    sortOrder: 0,
    validationRules: null,
    groupId: null,
    ...p,
  };
}
function cfg(fields: FormConfigField[]): FormConfig {
  return {
    entityType: "app_auth.User",
    surface: "edit",
    groups: [{ id: 1, name: "G", sortOrder: 0, fields }],
  };
}

describe("buildConfigSchema", () => {

  it("requires registration custom fields", () => {
    const base = z.object({ name: z.string() });
    const schema = buildConfigSchema(base, cfg([field({ fieldKey: "shirt", requiredAt: "registration" })]), "create");
    expect(schema.safeParse({ name: "A", custom_data: {} }).success).toBe(false);
    expect(schema.safeParse({ name: "A", custom_data: { shirt: "L" } }).success).toBe(true);
  });

  it("tightens a builtin top-level field to required by policy", () => {
    const base = z.object({ name: z.string(), date_of_birth: z.coerce.date().nullable().optional() });
    const schema = buildConfigSchema(
      base,
      cfg([field({ source: "builtin", fieldKey: "date_of_birth", fieldType: "date", requiredAt: "registration" })]),
      "create"
    );
    expect(schema.safeParse({ name: "A" }).success).toBe(false);
    expect(schema.safeParse({ name: "A", date_of_birth: "2000-01-01" }).success).toBe(true);
  });

  it("leaves builtin fields untouched when policy is never", () => {
    const base = z.object({ name: z.string(), date_of_birth: z.coerce.date().nullable().optional() });
    const schema = buildConfigSchema(
      base,
      cfg([field({ source: "builtin", fieldKey: "date_of_birth", fieldType: "date", requiredAt: "never" })]),
      "edit"
    );
    expect(schema.safeParse({ name: "A" }).success).toBe(true);
  });
});
