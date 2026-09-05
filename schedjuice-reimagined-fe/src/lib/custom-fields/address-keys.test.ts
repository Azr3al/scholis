import { describe, expect, it } from "vitest";
import { partitionAddressFields } from "./address-keys";
import type { FormConfigField } from "@/types/form-config";

function f(fieldKey: string): FormConfigField {
  return {
    id: 1,
    source: "builtin",
    fieldKey,
    fieldLabel: fieldKey,
    fieldType: "text",
    choices: null,
    description: "",
    requiredAt: "never",
    filledBy: "both",
    isFilterable: false,
    sortOrder: 0,
    validationRules: null,
    groupId: 1,
  };
}

describe("address keys", () => {
  it("partitions address vs non-address fields preserving order", () => {
    const fields = [f("date_of_birth"), f("country"), f("region"), f("delivery_address")];
    const { addressFields, otherFields } = partitionAddressFields(fields);
    expect(addressFields.map((x) => x.fieldKey)).toEqual(["country", "region"]);
    expect(otherFields.map((x) => x.fieldKey)).toEqual(["date_of_birth", "delivery_address"]);
  });
});
