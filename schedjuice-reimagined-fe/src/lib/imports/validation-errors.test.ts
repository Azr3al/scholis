import { describe, expect, it } from "vitest";

import type { ImportFieldDef } from "@/app/client-api/imports";
import {
  collectClientErrors,
  mapServerCommitErrors,
  mergeValidationErrors,
} from "@/lib/imports/validation-errors";

const dob: ImportFieldDef = {
  field_key: "date_of_birth",
  field_label: "DOB",
  field_type: "date",
  choices: null,
  source: "builtin",
  special: null,
  required_for_role: false,
};

describe("validation-errors", () => {
  it("collects client errors from invalid cells", () => {
    const errors = collectClientErrors({
      rows: [["nope"]],
      mapping: { 0: "date_of_birth" },
      fields: [dob],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      sourceRow: 0,
      field: "date_of_birth",
      origin: "client",
    });
  });

  it("skips rows in skippedRows set", () => {
    const errors = collectClientErrors({
      rows: [["nope"], ["also-bad"]],
      mapping: { 0: "date_of_birth" },
      fields: [dob],
      skippedRows: new Set([0]),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].sourceRow).toBe(1);
  });

  it("maps server commit errors via row index map", () => {
    const mapped = mapServerCommitErrors(
      [{ row: 1, field: "date_of_birth", reason: "Invalid date." }],
      [0, 2],
    );
    expect(mapped).toEqual([
      {
        sourceRow: 2,
        field: "date_of_birth",
        reason: "Invalid date.",
        origin: "server",
      },
    ]);
  });

  it("merges client and server errors with server winning on duplicate keys", () => {
    const merged = mergeValidationErrors(
      [{ sourceRow: 0, field: "date_of_birth", reason: "Invalid date", origin: "client" }],
      [{ sourceRow: 0, field: "date_of_birth", reason: "Invalid date.", origin: "server" }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].origin).toBe("server");
    expect(merged[0].reason).toBe("Invalid date.");
  });
});
