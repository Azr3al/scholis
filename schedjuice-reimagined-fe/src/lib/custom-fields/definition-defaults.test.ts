import { describe, expect, it } from "vitest";
import { buildDefinitionPayload, slugifyKey } from "./definition-defaults";

describe("slugifyKey", () => {
  it("lowercases, replaces spaces and strips invalid chars", () => {
    expect(slugifyKey("Blood Type!")).toBe("blood_type");
    expect(slugifyKey("  T-Shirt  Size ")).toBe("t-shirt_size");
    expect(slugifyKey("já_ok2")).toBe("ja_ok2");
  });
});

describe("buildDefinitionPayload", () => {
  it("derives visibility when overrides are absent and strips choices for non-choice", () => {
    const body = buildDefinitionPayload({
      entity_type: "app_auth.User",
      field_key: "blood_type",
      field_label: "Blood type",
      field_type: "text",
      required_at: "registration",
      roles: ["student"],
      filled_by: "user",
      is_filterable: false,
      description: "",
      group: null,
      choices: [{ value: "a", label: "A" }],
    });
    expect(body.show_on_create).toBe(true);
    expect(body.show_on_edit).toBe(true);
    expect(body.show_on_detail).toBe(true);
    expect(body.choices).toBeUndefined();
    expect(body.roles).toEqual(["student"]);
  });

  it("profile_completion hides create, shows edit+detail when no override", () => {
    const body = buildDefinitionPayload({
      entity_type: "app_auth.User",
      field_key: "tshirt",
      field_label: "T-shirt",
      field_type: "text",
      required_at: "profile_completion",
      roles: [],
      filled_by: "user",
      is_filterable: false,
      description: "",
      group: null,
    });
    expect(body.show_on_create).toBe(false);
    expect(body.show_on_edit).toBe(true);
    expect(body.show_on_detail).toBe(true);
  });

  it("keeps choices for choice type and respects explicit visibility overrides", () => {
    const body = buildDefinitionPayload({
      entity_type: "app_auth.User",
      field_key: "house",
      field_label: "House",
      field_type: "choice",
      required_at: "never",
      roles: [],
      filled_by: "both",
      is_filterable: true,
      description: "pick one",
      group: 4,
      choices: [{ value: "g", label: "Gryffindor" }],
      visibilityOverride: {
        show_on_create: true,
        show_on_edit: false,
        show_on_detail: true,
      },
    });
    expect(body.choices).toEqual([{ value: "g", label: "Gryffindor" }]);
    expect(body.show_on_create).toBe(true);
    expect(body.show_on_edit).toBe(false);
    expect(body.group).toBe(4);
  });
});
