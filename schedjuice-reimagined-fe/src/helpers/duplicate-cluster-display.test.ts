import { describe, expect, it } from "vitest";
import type { DuplicateCluster, DuplicateMatchReason } from "@/types/user-insights";
import {
  formatMatchReasonBadgeText,
  isClusterLikelyFalsePositive,
} from "./duplicate-cluster-display";

const makeReason = (
  overrides: Partial<DuplicateMatchReason> = {}
): DuplicateMatchReason => ({
  field: "phone",
  label: "Shared phone",
  normalized_value: "959123456789",
  user_ids: [1, 2],
  possible_sibling: false,
  ...overrides,
});

describe("formatMatchReasonBadgeText", () => {
  it("appends normalized value", () => {
    expect(formatMatchReasonBadgeText(makeReason())).toBe(
      "Shared phone · 959123456789"
    );
  });

  it("appends placeholder and name mismatch suffixes", () => {
    expect(
      formatMatchReasonBadgeText(
        makeReason({
          normalized_value: "0900000",
          possible_sibling: true,
        })
      )
    ).toBe("Shared phone · 0900000 · placeholder · name mismatch");
  });
});

describe("isClusterLikelyFalsePositive", () => {
  it("is true when all reasons are suspicious", () => {
    const cluster: Pick<DuplicateCluster, "match_reasons"> = {
      match_reasons: [
        makeReason({ normalized_value: "0900000" }),
        makeReason({
          field: "communication_email",
          label: "Shared communication email",
          normalized_value: "test@test.com",
        }),
      ],
    };
    expect(isClusterLikelyFalsePositive(cluster)).toBe(true);
  });

  it("is false when any reason is real", () => {
    const cluster: Pick<DuplicateCluster, "match_reasons"> = {
      match_reasons: [
        makeReason({ normalized_value: "0900000" }),
        makeReason({ normalized_value: "959123456789" }),
      ],
    };
    expect(isClusterLikelyFalsePositive(cluster)).toBe(false);
  });

  it("is false when there are no reasons", () => {
    expect(isClusterLikelyFalsePositive({ match_reasons: [] })).toBe(false);
  });
});
