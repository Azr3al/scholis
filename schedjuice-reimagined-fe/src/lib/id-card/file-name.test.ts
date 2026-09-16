import { describe, expect, it } from "vitest";
import { cardFileName } from "./file-name";

describe("cardFileName", () => {
  it("strips punctuation and collapses spaces", () => {
    expect(cardFileName("  Daw   Khin (May) ", "pdf")).toBe("id-card-daw-khin-may.pdf");
  });
  it("falls back to 'id-card' for empty names", () => {
    expect(cardFileName("", "pdf")).toBe("id-card.pdf");
  });
});
