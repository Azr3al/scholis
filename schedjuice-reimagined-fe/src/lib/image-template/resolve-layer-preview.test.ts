import { describe, expect, it } from "vitest";
import { SAMPLE_AWARD_BINDER } from "./preview-binder";
import { resolveLayerPreview } from "./resolve-layer-preview";
import type { Layer } from "./types";

const base = {
  id: "1",
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  z: 0,
} as const;

describe("resolveLayerPreview", () => {
  it("interpolates tokens inside a free text layer", () => {
    const preview = resolveLayerPreview(
      {
        ...base,
        type: "text",
        text: "this is to certify that {{student_name}} has finished {{course_name}}",
      },
      SAMPLE_AWARD_BINDER,
    );
    expect(preview.kind).toBe("text");
    if (preview.kind === "text") {
      expect(preview.text).toBe(
        "this is to certify that Alex Rivera has finished Sample course",
      );
    }
  });

  it("uses she for sample FEMALE pronoun field", () => {
    const layer: Layer = { ...base, type: "field", field: "pronoun" };
    const preview = resolveLayerPreview(layer, SAMPLE_AWARD_BINDER);
    expect(preview.kind).toBe("text");
    if (preview.kind === "text") expect(preview.text).toBe("she");
  });

  it("mt signature with null url is placeholder and does not throw", () => {
    const layer: Layer = { ...base, type: "signature", bind: { kind: "mt" } };
    const preview = resolveLayerPreview(layer, SAMPLE_AWARD_BINDER);
    expect(preview.kind).toBe("image");
    if (preview.kind === "image") {
      expect(preview.url).toBeNull();
      expect(preview.placeholder).toBe(true);
    }
  });

  it("interpolates a named person sentence", () => {
    const preview = resolveLayerPreview(
      {
        ...base,
        type: "named_person",
        user_id: 9,
        template: "This award is for {{named person}}",
      },
      {
        ...SAMPLE_AWARD_BINDER,
        namedUsers: { 9: { name: "Kyaw Thu", signatureUrl: null } },
      },
    );
    expect(preview.kind).toBe("text");
    if (preview.kind === "text") expect(preview.text).toBe("This award is for Kyaw Thu");
  });

  it("named_person with missing user uses placeholder text, not bytes", () => {
    const preview = resolveLayerPreview(
      { ...base, type: "named_person", user_id: 99 },
      { ...SAMPLE_AWARD_BINDER, namedUsers: {} },
    );
    expect(preview.kind).toBe("text");
    if (preview.kind === "text") expect(preview.text).toMatch(/unavailable/i);
  });
});
