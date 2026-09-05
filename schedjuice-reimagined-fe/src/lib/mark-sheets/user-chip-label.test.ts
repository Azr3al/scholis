import { describe, expect, it } from "vitest";

import { formatMatchedUserChipLabel } from "@/lib/mark-sheets/user-chip-label";

describe("formatMatchedUserChipLabel", () => {
  it("formats name and email", () => {
    expect(
      formatMatchedUserChipLabel({
        label: "Hla Hla",
        email: "hlahla@hlahla.com",
      }),
    ).toBe("Hla Hla (hlahla@hlahla.com)");
  });

  it("returns label only when email missing", () => {
    expect(formatMatchedUserChipLabel({ label: "Hla Hla" })).toBe("Hla Hla");
  });
});
