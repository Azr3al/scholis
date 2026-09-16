import { describe, expect, it } from "vitest";

import type { ImportFieldDef } from "@/app/client-api/imports";

import { editorKindForField } from "./editor-kind";

function field(
  overrides: Partial<ImportFieldDef> & Pick<ImportFieldDef, "field_key">,
): ImportFieldDef {
  return {
    field_label: overrides.field_key,
    field_type: "text",
    choices: null,
    source: "builtin",
    special: null,
    required_for_role: false,
    ...overrides,
  };
}

describe("editorKindForField", () => {
  const fieldByKey = new Map<string, ImportFieldDef>([
    ["email", field({ field_key: "email", field_type: "email", special: "user" })],
    ["courses", field({ field_key: "courses", special: "course" })],
    ["date_of_birth", field({ field_key: "date_of_birth", field_type: "date" })],
    ["gender", field({ field_key: "gender", field_type: "choice", choices: [] })],
    ["active", field({ field_key: "active", field_type: "boolean" })],
    ["score", field({ field_key: "score", field_type: "number" })],
    ["name", field({ field_key: "name", field_type: "text" })],
  ]);

  it("maps special fields to link editors", () => {
    expect(editorKindForField("email", fieldByKey)).toBe("link-user");
    expect(editorKindForField("courses", fieldByKey)).toBe("link-course");
  });

  it("maps field types to typed editors", () => {
    expect(editorKindForField("date_of_birth", fieldByKey)).toBe("date");
    expect(editorKindForField("gender", fieldByKey)).toBe("choice");
    expect(editorKindForField("active", fieldByKey)).toBe("boolean");
    expect(editorKindForField("score", fieldByKey)).toBe("number");
    expect(editorKindForField("name", fieldByKey)).toBe("text");
  });

  it("defaults unknown fields to text", () => {
    expect(editorKindForField("missing", fieldByKey)).toBe("text");
  });
});
