import { describe, expect, it } from "vitest";
import {
  documentToIdCardPayload,
  documentToIdCardSlots,
  idCardTemplateToDocument,
} from "./id-card";

describe("idCardTemplateToDocument", () => {
  it("loads a flattened text slot row without font fields", () => {
    const doc = idCardTemplateToDocument({
      width_in: 2.125,
      height_in: 3.375,
      background_url: null,
      slots: [
        {
          id: "t1",
          type: "text",
          field: "name",
          x: 0.2,
          y: 0.5,
          width: 1.7,
          height: 0.25,
        },
      ],
    });
    expect(doc.kind).toBe("id_card");
    if (doc.kind !== "id_card") return;
    expect(doc.faces.front).toHaveLength(1);
    const layer = doc.faces.front[0];
    expect(layer.type).toBe("field");
    if (layer.type === "field") expect(layer.field).toBe("name");
  });

  it("round-trips fontStyle bold on a text field slot", () => {
    const doc = idCardTemplateToDocument({
      width_in: 2.125,
      height_in: 3.375,
      background_url: null,
      slots: [
        {
          id: "t1",
          type: "text",
          field: "name",
          x: 0.2,
          y: 0.5,
          width: 1.7,
          height: 0.25,
          fontStyle: "bold",
        },
      ],
    });
    const layer = doc.faces.front[0];
    expect(layer.type).toBe("field");
    if (layer.type === "field") expect(layer.fontStyle).toBe("bold");

    const { slots } = documentToIdCardSlots(doc);
    expect(slots[0]).toMatchObject({ type: "text", field: "name", fontStyle: "bold" });

    const roundTrip = idCardTemplateToDocument({
      width_in: 2.125,
      height_in: 3.375,
      background_url: null,
      slots,
    });
    const roundTripLayer = roundTrip.faces.front[0];
    if (roundTripLayer.type === "field") expect(roundTripLayer.fontStyle).toBe("bold");
  });

  it("writes slots back as type text with field name", () => {
    const doc = idCardTemplateToDocument({
      width_in: 2.125,
      height_in: 3.375,
      background_url: null,
      slots: [
        {
          id: "t1",
          type: "text",
          field: "name",
          x: 0.2,
          y: 0.5,
          width: 1.7,
          height: 0.25,
        },
      ],
    });
    const { slots } = documentToIdCardSlots(doc);
    expect(slots[0]).toMatchObject({ type: "text", field: "name" });
  });

  it("legacy template without transform gets identity fill per face", () => {
    const doc = idCardTemplateToDocument({
      width_in: 2.125,
      height_in: 3.375,
      background_url: null,
      slots: [],
    });
    expect(doc.background.front).toMatchObject({
      url: null,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
    expect(doc.background.back).toMatchObject({
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
    expect(doc.pagePreset).toBe("id_cr80_portrait");
  });

  it("writes background_transform, not into slots", () => {
    const doc = idCardTemplateToDocument({
      width_in: 3.375,
      height_in: 2.125,
      background_url: "https://example.com/f.png",
      slots: [],
      background_transform: {
        front: { offsetX: -0.1, offsetY: 0, scale: 1.2 },
        back: { offsetX: 0, offsetY: 0, scale: 1 },
      },
    });
    const payload = documentToIdCardPayload(doc);
    expect(payload.background_transform.front).toEqual({
      offsetX: -0.1,
      offsetY: 0,
      scale: 1.2,
    });
    expect(payload.slots).toEqual([]);
  });

  it("round-trips underline and removeBackground", () => {
    const doc = idCardTemplateToDocument({
      width_in: 2.125,
      height_in: 3.375,
      background_url: null,
      slots: [
        {
          id: "t1",
          type: "static_text",
          text: "Hello",
          x: 0.2,
          y: 0.5,
          width: 1.7,
          height: 0.25,
          underline: true,
          italic: true,
        },
        {
          id: "p1",
          type: "photo",
          x: 0.5,
          y: 0.8,
          width: 0.9,
          height: 1.1,
          removeBackground: true,
          borderRadiusPt: 8,
        },
      ],
    });
    const text = doc.faces.front[0];
    const photo = doc.faces.front[1];
    expect(text?.type).toBe("text");
    if (text?.type === "text") {
      expect(text.underline).toBe(true);
      expect(text.italic).toBe(true);
    }
    expect(photo?.type).toBe("photo");
    if (photo?.type === "photo") expect(photo.removeBackground).toBe(true);
    const { slots } = documentToIdCardSlots(doc);
    expect(slots[0]).toMatchObject({ underline: true, italic: true });
    expect(slots[1]).toMatchObject({ removeBackground: true, borderRadiusPt: 8 });
  });
});
