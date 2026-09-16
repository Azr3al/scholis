import { describe, expect, it } from "vitest";
import { bindNamedPerson } from "./named-person-bind";
import type { Layer } from "./types";

describe("bindNamedPerson", () => {
  it("stores user_id on the layer and no dataUrl", () => {
    const layer: Layer = {
      id: "1",
      type: "named_person",
      user_id: 0,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      z: 0,
    };
    const next = bindNamedPerson(layer, 42);
    expect(next.type).toBe("named_person");
    if (next.type === "named_person") expect(next.user_id).toBe(42);
    expect("dataUrl" in next).toBe(false);
  });
});
