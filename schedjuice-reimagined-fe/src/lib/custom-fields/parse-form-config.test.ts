import { describe, expect, it } from "vitest";
import { parseFormConfig } from "./parse-form-config";

describe("parseFormConfig", () => {
  it("returns empty groups for malformed input", () => {
    expect(parseFormConfig(null).groups).toEqual([]);
    expect(parseFormConfig({ data: {} }).groups).toEqual([]);
  });

  it("normalizes groups and fields, sorting by sort_order then id", () => {
    const raw = {
      data: {
        entity_type: "app_auth.User",
        surface: "edit",
        groups: [
          {
            id: 2,
            name: "Address",
            sort_order: 1,
            fields: [
              {
                id: 9,
                source: "builtin",
                field_key: "city",
                field_label: "City",
                field_type: "text",
                choices: null,
                required_at: "never",
                filled_by: "both",
                sort_order: 1,
                group_id: 2,
              },
              {
                id: 8,
                source: "builtin",
                field_key: "region",
                field_label: "Region",
                field_type: "text",
                choices: null,
                required_at: "never",
                filled_by: "both",
                sort_order: 0,
                group_id: 2,
              },
            ],
          },
        ],
      },
    };
    const cfg = parseFormConfig(raw);
    expect(cfg.entityType).toBe("app_auth.User");
    expect(cfg.surface).toBe("edit");
    expect(cfg.groups[0].name).toBe("Address");
    expect(cfg.groups[0].fields.map((f) => f.fieldKey)).toEqual(["region", "city"]);
    expect(cfg.groups[0].fields[0].source).toBe("builtin");
  });

  it("drops fields with no field_key and accepts source=custom", () => {
    const cfg = parseFormConfig({
      data: {
        groups: [
          {
            id: null,
            name: "General",
            sort_order: 1,
            fields: [
              {
                id: 1,
                source: "custom",
                field_key: "shirt_size",
                field_label: "Shirt size",
                field_type: "choice",
                choices: [{ value: "s", label: "S" }],
                required_at: "registration",
                filled_by: "user",
                sort_order: 0,
                group_id: null,
              },
              { id: 2, field_label: "broken", field_type: "text" },
            ],
          },
        ],
      },
    });
    expect(cfg.groups[0].fields).toHaveLength(1);
    expect(cfg.groups[0].fields[0].fieldKey).toBe("shirt_size");
  });

});
