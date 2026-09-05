import { describe, expect, it } from "vitest";

import {
  computeTeamsBudget,
  TEAMS_MAX_INLINE_BYTES,
  TEAMS_MAX_INLINE_IMAGES,
} from "./teams-inline-image-budget";

describe("computeTeamsBudget", () => {
  it("accepts posts within image count and byte limits", () => {
    const budget = computeTeamsBudget([
      { attachmentId: 1, byteSize: 100_000 },
      { attachmentId: 2, byteSize: 200_000 },
    ]);
    expect(budget.withinBudget).toBe(true);
    expect(budget.errors).toHaveLength(0);
  });

  it("rejects more than 10 inline images", () => {
    const nodes = Array.from({ length: TEAMS_MAX_INLINE_IMAGES + 1 }, (_, i) => ({
      attachmentId: i + 1,
      byteSize: 1000,
    }));
    const budget = computeTeamsBudget(nodes);
    expect(budget.withinBudget).toBe(false);
    expect(budget.errors.join(" ")).toMatch(/10/);
  });

  it("rejects total bytes over the Teams budget", () => {
    const budget = computeTeamsBudget([
      { attachmentId: 1, byteSize: TEAMS_MAX_INLINE_BYTES + 1 },
    ]);
    expect(budget.withinBudget).toBe(false);
    expect(budget.errors.join(" ")).toMatch(/Teams limit/);
  });

  it("ignores pending nodes without attachment id", () => {
    const budget = computeTeamsBudget([
      { attachmentId: null, byteSize: TEAMS_MAX_INLINE_BYTES },
    ]);
    expect(budget.withinBudget).toBe(true);
    expect(budget.imageCount).toBe(0);
  });
});
