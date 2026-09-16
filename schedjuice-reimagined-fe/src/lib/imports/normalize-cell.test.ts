import { describe, expect, it } from "vitest";

import type { ImportFieldDef } from "@/app/client-api/imports";
import { normalizeCell } from "@/lib/imports/normalize-cell";

const dob: ImportFieldDef = {
  field_key: "date_of_birth",
  field_label: "DOB",
  field_type: "date",
  choices: null,
  source: "builtin",
  special: null,
  required_for_role: false,
};

const gender: ImportFieldDef = {
  field_key: "gender",
  field_label: "Gender",
  field_type: "choice",
  choices: [{ value: "male", label: "Male" }],
  source: "builtin",
  special: null,
  required_for_role: false,
};

describe("normalizeCell", () => {
  it("normalizes dates to ISO", () => {
    expect(normalizeCell("1/2/2026", dob)).toEqual({
      status: "adjusted",
      value: "2026-01-02",
    });
  });

  it("matches choice label to value", () => {
    expect(normalizeCell("Male", gender)).toEqual({
      status: "adjusted",
      value: "male",
    });
  });

  it("flags unparseable as error", () => {
    expect(normalizeCell("nope", dob).status).toBe("error");
  });

  it("rejects impossible ISO-shaped dates", () => {
    expect(normalizeCell("2026-13-40", dob).status).toBe("error");
    expect(normalizeCell("2026-02-30", dob).status).toBe("error");
  });

  it("treats blank as valid empty", () => {
    expect(normalizeCell("", gender)).toEqual({ status: "valid", value: "" });
  });
});
