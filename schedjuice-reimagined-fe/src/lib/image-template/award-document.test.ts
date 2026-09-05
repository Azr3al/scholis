import { describe, expect, it } from "vitest";
import {
  awardDocumentFromSavedTemplate,
  createAwardLayer,
  emptyAwardDocument,
  parseAwardDocument,
} from "./award-document";

describe("parseAwardDocument", () => {
  it("fills identity crop when legacy background is only a url", () => {
    const parsed = parseAwardDocument({
      version: 1,
      kind: "award",
      unit: "px",
      width: 800,
      height: 600,
      background: { url: "https://example.com/bg.png" },
      layers: [],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.background).toEqual({
      url: "https://example.com/bg.png",
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
    expect(parsed?.pagePreset).toBe("original");
  });
});

describe("createAwardLayer", () => {
  it("persists a default fontSize on text and removeBackground on photos", () => {
    const text = createAwardLayer("text", 0);
    expect(text.type).toBe("text");
    if (text.type === "text") expect(text.fontSize).toBe(40);
    const photo = createAwardLayer("photo", 1);
    expect(photo.type).toBe("photo");
    if (photo.type === "photo") {
      expect(photo.removeBackground).toBe(true);
      expect(photo.photoKind).toBe("award_image");
    }
  });

  it("sizes a student_name field wide enough for the token chip", () => {
    const layer = createAwardLayer("student_name", 0);
    expect(layer.type).toBe("field");
    if (layer.type !== "field") return;
    expect(layer.width).toBeGreaterThan(200);
    expect(layer.fontSize).toBeGreaterThan(0);
  });

  it("reads legacy fontStyle bold as bold", () => {
    const parsed = parseAwardDocument({
      version: 1,
      kind: "award",
      unit: "px",
      width: 800,
      height: 600,
      background: { url: null },
      layers: [
        {
          id: "t1",
          type: "text",
          text: "Hi",
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          z: 0,
          fontStyle: "bold",
        },
      ],
    });
    const layer = parsed?.layers[0];
    expect(layer?.type).toBe("text");
    if (layer?.type === "text") expect(layer.bold).toBe(true);
  });
});

describe("emptyAwardDocument", () => {
  it("starts with identity fill and original preset", () => {
    const doc = emptyAwardDocument();
    expect(doc.background).toEqual({
      url: null,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
    expect(doc.pagePreset).toBe("original");
  });
});

describe("awardDocumentFromSavedTemplate", () => {
  it("binds background_url when the stored document url is null", () => {
    const current = {
      ...emptyAwardDocument(),
      width: 800,
      height: 600,
      background: { url: null, offsetX: 0, offsetY: 12, scale: 1.25 },
    };
    const next = awardDocumentFromSavedTemplate({
      document: current,
      background_url: "https://cdn.example/bg.png",
    });
    expect(next?.background.url).toBe("https://cdn.example/bg.png");
    expect(next?.background.offsetY).toBe(12);
    expect(next?.background.scale).toBe(1.25);
  });

  it("replaces a stale document background url with the saved file url", () => {
    const current = {
      ...emptyAwardDocument(),
      width: 800,
      height: 600,
      background: {
        url: "https://cdn.example/old.png",
        offsetX: 4,
        offsetY: 0,
        scale: 1,
      },
    };
    const next = awardDocumentFromSavedTemplate({
      document: current,
      background_url: "https://cdn.example/new.png",
    });
    expect(next?.background.url).toBe("https://cdn.example/new.png");
    expect(next?.background.offsetX).toBe(4);
  });
});
