import { describe, expect, it } from "vitest";
import {
  validateDraftField,
  type DraftReportTypeField,
} from "./report-type-field-validation";

describe("validateDraftField", () => {
  const base: DraftReportTypeField = {
    field_key: "outcome",
    field_label: "Outcome",
    field_type: "text",
    is_required: false,
    choices: null,
    sort_order: 0,
  };

  it("fails choice fields with no options", () => {
    const f: DraftReportTypeField = {
      ...base,
      field_type: "choice",
      choices: [],
    };
    expect(validateDraftField(f)).toEqual({
      ok: false,
      message: "Add at least one choice.",
      fieldKey: "outcome",
    });
  });

  it("passes choice fields with populated options", () => {
    const f: DraftReportTypeField = {
      ...base,
      field_type: "choice",
      choices: [
        { value: "reached", label: "Reached" },
        { value: "no_response", label: "No response" },
      ],
    };
    expect(validateDraftField(f)).toEqual({ ok: true });
  });
});
