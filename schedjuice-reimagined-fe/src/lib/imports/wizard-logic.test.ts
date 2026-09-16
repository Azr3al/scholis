import { describe, expect, it } from "vitest";

import type { ImportFieldDef } from "@/app/client-api/imports";
import {
  buildAutoMapping,
  collectUniqueColumnValues,
  collectUniqueCourseTokens,
  collectUniqueEmails,
  getUnmappedRequiredFields,
  isValidEmail,
  matchableMappedColumns,
  scoreHeaderField,
  splitCourseTokens,
} from "@/lib/imports/wizard-logic";

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

const TEST_FIELDS: ImportFieldDef[] = [
  field("email", "Email", { field_type: "email", source: "identity", special: "user" }),
  field("name", "Name", { source: "identity" }),
  field("phone_number", "Phone number"),
  field("city", "City"),
  field("township", "Township"),
  field("region", "Region"),
  field("country", "Country"),
  field("courses", "Courses", { source: "special", special: "course" }),
];

describe("scoreHeaderField", () => {

  it("returns 0 for unknown headers", () => {
    expect(scoreHeaderField("favourite colour", field("email", "Email"))).toBe(0);
  });

  it("rejects long question headers containing course or email keywords", () => {
    expect(
      scoreHeaderField("How do you know about this course?", field("courses", "Courses")),
    ).toBe(0);
    expect(
      scoreHeaderField(
        "Please enter your email address if you agree to receive updates about courses",
        field("email", "Email"),
      ),
    ).toBe(0);
  });
});

describe("buildAutoMapping", () => {

  it("does not map question-style course headers", () => {
    const mapping = buildAutoMapping(
      ["How do you know about this course?"],
      TEST_FIELDS,
    );
    expect(mapping[0]).toBeNull();
  });

  it("keeps only the best email column when duplicates compete", () => {
    const mapping = buildAutoMapping(
      ["Email", "Email address notes for marketing purposes only"],
      TEST_FIELDS,
    );
    expect(mapping[0]).toBe("email");
    expect(mapping[1]).toBeNull();
  });

  it("prefers exact Email over a long header that mentions email", () => {
    const mapping = buildAutoMapping(
      [
        "Please read this email instruction carefully before submitting",
        "Email",
      ],
      TEST_FIELDS,
    );
    expect(mapping[0]).toBeNull();
    expect(mapping[1]).toBe("email");
  });
});

describe("getUnmappedRequiredFields", () => {
  const fields: ImportFieldDef[] = [
    field("email", "Email", { required_for_role: true }),
    field("testing_field", "Testing field", {
      source: "custom",
      required_for_role: true,
    }),
    field("city", "City"),
  ];

  it("returns required fields that are neither mapped nor defaulted", () => {
    expect(
      getUnmappedRequiredFields(fields, { 0: "email" }, {}),
    ).toEqual([fields[1]]);
  });

  it("excludes fields with a default value", () => {
    expect(
      getUnmappedRequiredFields(fields, { 0: "email" }, { testing_field: "N/A" }),
    ).toEqual([]);
  });

  it("excludes mapped required fields", () => {
    expect(
      getUnmappedRequiredFields(
        fields,
        { 0: "email", 1: "testing_field" },
        {},
      ),
    ).toEqual([]);
  });
});

describe("isValidEmail", () => {
  it("validates", () => {
    expect(isValidEmail("a@x.edu")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("splitCourseTokens", () => {
  it("splits comma-separated, trims, drops blanks", () => {
    expect(splitCourseTokens("Y2 R1, Math ,")).toEqual(["Y2 R1", "Math"]);
    expect(splitCourseTokens("")).toEqual([]);
    expect(splitCourseTokens(null)).toEqual([]);
  });
});

describe("collectors", () => {
  const rows = [
    ["A@x.edu", "Y2 R1, Math"],
    ["a@x.edu", "Math"],
    ["", ""],
  ];

  it("collects unique valid emails (case-insensitive)", () => {
    expect(collectUniqueEmails(rows, 0)).toEqual(["A@x.edu"]);
  });

  it("collects unique course tokens", () => {
    expect(collectUniqueCourseTokens(rows, 1).sort()).toEqual(["Math", "Y2 R1"]);
  });
});

describe("matchableMappedColumns", () => {
  it("returns mapped email/phone columns with their type", () => {
    const mapping = {
      0: "email",
      1: "name",
      2: "communication_email",
      3: "phone_number",
    };
    expect(matchableMappedColumns(mapping)).toEqual([
      { fieldKey: "email", colIndex: 0, type: "email" },
      { fieldKey: "communication_email", colIndex: 2, type: "email" },
      { fieldKey: "phone_number", colIndex: 3, type: "phone" },
    ]);
  });
});

describe("collectUniqueColumnValues", () => {
  it("dedupes non-empty trimmed values", () => {
    const rows = [["a@x.com"], [" a@x.com "], [""], ["b@x.com"]];
    expect(collectUniqueColumnValues(rows, 0)).toEqual(["a@x.com", "b@x.com"]);
  });
});
