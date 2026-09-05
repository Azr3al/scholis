import { describe, it, expect } from "vitest";
import { buildGroupPayload } from "./config-payload";

describe("buildGroupPayload", () => {
  it("nests custom_data fields and keeps builtin fields flat", () => {
    const values = {
      name: "X",
      phone_number: "1",
      "custom_data.blood_type": "O+",
      "custom_data.allergies": "none",
    };
    const out = buildGroupPayload(values, ["phone_number", "custom_data.blood_type"]);
    expect(out).toEqual({
      phone_number: "1",
      custom_data: { blood_type: "O+" },
    });
  });
  it("returns {} for no fields", () => {
    expect(buildGroupPayload({ a: 1 }, [])).toEqual({});
  });
  it("merges multiple custom_data keys", () => {
    const out = buildGroupPayload(
      { "custom_data.a": 1, "custom_data.b": 2 },
      ["custom_data.a", "custom_data.b"],
    );
    expect(out).toEqual({ custom_data: { a: 1, b: 2 } });
  });
});
