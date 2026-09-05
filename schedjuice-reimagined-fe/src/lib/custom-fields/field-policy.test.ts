import { describe, expect, it } from "vitest";
import { fieldFormPath, isFieldReadOnly, isFieldRequired } from "./field-policy";
import type { FormConfigField } from "@/types/form-config";

const base: FormConfigField = {
  id: 1,
  source: "custom",
  fieldKey: "shirt_size",
  fieldLabel: "Shirt size",
  fieldType: "text",
  choices: null,
  description: "",
  requiredAt: "never",
  filledBy: "both",
  isFilterable: false,
  sortOrder: 0,
  validationRules: null,
  groupId: null,
};

describe("field policy", () => {

  it("required only when stage matches surface", () => {
    expect(isFieldRequired({ ...base, requiredAt: "registration" }, "create")).toBe(true);
    expect(isFieldRequired({ ...base, requiredAt: "registration" }, "edit")).toBe(true);
    expect(isFieldRequired({ ...base, requiredAt: "profile_completion" }, "create")).toBe(false);
    expect(isFieldRequired({ ...base, requiredAt: "profile_completion" }, "edit")).toBe(true);
    expect(isFieldRequired({ ...base, requiredAt: "never" }, "edit")).toBe(false);
  });

  it("read-only when actor cannot fill", () => {
    expect(isFieldReadOnly({ ...base, filledBy: "admin" }, "user")).toBe(true);
    expect(isFieldReadOnly({ ...base, filledBy: "admin" }, "admin")).toBe(false);
    expect(isFieldReadOnly({ ...base, filledBy: "user" }, "admin")).toBe(false);
    expect(isFieldReadOnly({ ...base, filledBy: "user" }, "user")).toBe(false);
    expect(isFieldReadOnly({ ...base, filledBy: "both" }, "user")).toBe(false);
  });
});
