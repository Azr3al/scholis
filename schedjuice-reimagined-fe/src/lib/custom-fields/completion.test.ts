import { describe, expect, it } from "vitest";
import {
  collectGroupPayload,
  filterConfigToKeys,
  missingKeysForAudience,
} from "./completion";
import type { MissingField } from "@/types/completion";
import type { FormConfig, FormConfigField } from "@/types/form-config";

const missing: MissingField[] = [
  {
    field_key: "date_of_birth",
    field_label: "Date of birth",
    filled_by: "user",
    source: "builtin",
  },
  {
    field_key: "salary_band",
    field_label: "Salary band",
    filled_by: "admin",
    source: "custom",
  },
  {
    field_key: "tshirt",
    field_label: "T-shirt",
    filled_by: "both",
    source: "custom",
  },
];

describe("missingKeysForAudience", () => {
  it("user audience keeps user+both", () => {
    expect(missingKeysForAudience(missing, "user")).toEqual(
      new Set(["date_of_birth", "tshirt"]),
    );
  });
  it("admin audience keeps admin+both", () => {
    expect(missingKeysForAudience(missing, "admin")).toEqual(
      new Set(["salary_band", "tshirt"]),
    );
  });
});

function field(p: Partial<FormConfigField>): FormConfigField {
  return {
    id: 0,
    source: "custom",
    fieldKey: "k",
    fieldLabel: "L",
    fieldType: "text",
    choices: null,
    description: "",
    requiredAt: "profile_completion",
    filledBy: "both",
    isFilterable: false,
    sortOrder: 0,
    validationRules: null,
    groupId: null,
    ...p,
  };
}

describe("filterConfigToKeys", () => {
  it("keeps only fields whose key is in the set and drops empty groups", () => {
    const config: FormConfig = {
      entityType: "app_auth.User",
      surface: "edit",
      groups: [
        {
          id: 1,
          name: "Personal",
          sortOrder: 0,
          fields: [
            field({ fieldKey: "date_of_birth", source: "builtin" }),
            field({ fieldKey: "gender", source: "builtin" }),
          ],
        },
        {
          id: 2,
          name: "Payroll",
          sortOrder: 1,
          fields: [field({ fieldKey: "shoe_size" })],
        },
      ],
    };
    const out = filterConfigToKeys(config, new Set(["date_of_birth"]));
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].fields.map((f) => f.fieldKey)).toEqual(["date_of_birth"]);
  });
});

describe("collectGroupPayload", () => {
  it("nests builtin at top level and custom under custom_data", () => {
    const fields = [
      field({ fieldKey: "date_of_birth", source: "builtin" }),
      field({ fieldKey: "tshirt", source: "custom" }),
    ];
    const formValues = {
      date_of_birth: "2000-01-01",
      custom_data: { tshirt: "M", other: "x" },
    };
    expect(collectGroupPayload(fields, formValues)).toEqual({
      date_of_birth: "2000-01-01",
      custom_data: { tshirt: "M" },
    });
  });

  it("omits custom_data when no custom fields present", () => {
    const fields = [field({ fieldKey: "date_of_birth", source: "builtin" })];
    expect(collectGroupPayload(fields, { date_of_birth: "x" })).toEqual({
      date_of_birth: "x",
    });
  });

  it("skips blank custom values so payload is not empty", () => {
    const fields = [field({ fieldKey: "testing_field", fieldType: "datetime" })];
    expect(
      collectGroupPayload(fields, {
        custom_data: { testing_field: undefined },
      }),
    ).toEqual({});
  });
});
