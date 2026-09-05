import { describe, expect, it } from "vitest";
import { staggerTickFrequencyHz } from "@/lib/sound/stagger-tick-sound";

describe("staggerTickFrequencyHz", () => {
  it("ascends by semitone at index 7", () => {
    expect(staggerTickFrequencyHz(7)).toBeCloseTo(440 * Math.pow(2, 7 / 12), 5);
  });
});
