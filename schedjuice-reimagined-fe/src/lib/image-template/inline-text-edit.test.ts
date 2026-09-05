import { describe, expect, it } from "vitest";
import { editableTextLayerId } from "./inline-text-edit";
import type { Layer } from "./types";

const text: Layer = {
  id: "t1",
  type: "text",
  text: "Hello",
  x: 0,
  y: 0,
  width: 80,
  height: 24,
  z: 0,
};

const photo: Layer = {
  id: "p1",
  type: "photo",
  photoKind: "award_image",
  x: 0,
  y: 0,
  width: 80,
  height: 80,
  z: 1,
};

describe("editableTextLayerId", () => {
  it("returns the text layer under a layer hit", () => {
    expect(editableTextLayerId({ kind: "layer", layerId: "t1" }, [text, photo])).toBe(
      "t1",
    );
  });

  it("does not open edit for photo or page hits", () => {
    expect(editableTextLayerId({ kind: "layer", layerId: "p1" }, [text, photo])).toBeNull();
    expect(editableTextLayerId({ kind: "page" }, [text, photo])).toBeNull();
  });

  it("opens edit for a named person variable", () => {
    const person: Layer = {
      id: "n1",
      type: "named_person",
      user_id: 1,
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      z: 0,
    };
    expect(editableTextLayerId({ kind: "layer", layerId: "n1" }, [person])).toBe("n1");
  });
});
