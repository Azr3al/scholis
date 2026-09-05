import { describe, expect, it } from "vitest";
import { countForStatus } from "./status-counts";

describe("countForStatus", () => {
  const counts = { active: 10, planned: 3, ended: 5, paused: 2 };

  it("rolls paused into active", () => {
    expect(countForStatus("active", counts)).toBe(12);
  });
});
