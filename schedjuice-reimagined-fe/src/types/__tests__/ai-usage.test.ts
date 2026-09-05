import { describe, expect, it } from "vitest";

import { formatCacheHitRate } from "@/types/ai-usage";

describe("formatCacheHitRate", () => {
  it("returns 0.0% for non-finite rates", () => {
    expect(formatCacheHitRate(Number.NaN)).toBe("0.0%");
    expect(formatCacheHitRate(Number.POSITIVE_INFINITY)).toBe("0.0%");
  });
});
