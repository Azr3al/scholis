import { describe, expect, it } from "vitest";

import type { ImportFieldDef } from "@/app/client-api/imports";
import { groupFields } from "./column-mapping-select";

function field(
  field_key: string,
  field_label: string,
  extra: Partial<ImportFieldDef> = {},
): ImportFieldDef {
  return {
    field_key,
    field_label,
    field_type: "text",
    choices: null,
    source: "builtin",
    special: null,
    required_for_role: false,
    ...extra,
  };
}

describe("groupFields", () => {
  it("sorts items alphabetically within each category", () => {
    const fields: ImportFieldDef[] = [
      field("email", "Email", { source: "identity", special: "user" }),
      field("name", "Name", { source: "identity" }),
      field("phone_number", "Phone number", { source: "identity" }),
      field("city", "City"),
      field("date_of_birth", "Date of birth"),
      field("courses", "Courses", { source: "special", special: "course" }),
      field("custom_b", "Beta field", { source: "custom" }),
      field("custom_a", "Alpha field", { source: "custom" }),
    ];

    const grouped = groupFields(fields);

    expect(grouped.special.map((f) => f.field_label)).toEqual([
      "Courses",
      "Email",
    ]);
    expect(grouped.builtin.map((f) => f.field_label)).toEqual([
      "City",
      "Date of birth",
      "Name",
      "Phone number",
    ]);
    expect(grouped.custom.map((f) => f.field_label)).toEqual([
      "Alpha field",
      "Beta field",
    ]);
  });
});
