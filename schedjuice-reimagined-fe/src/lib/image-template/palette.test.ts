import { describe, expect, it } from "vitest";
import { paletteForKind } from "./palette";

describe("paletteForKind", () => {
  it("award plus menu includes locked fields and not QR", () => {
    const keys = paletteForKind("award").map((item) => item.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "text",
        "student_name",
        "award_title",
        "period",
        "course_name",
        "pronoun",
        "current_date",
        "mt_name",
        "mt_signature",
        "named_person",
        "user_signature",
      ]),
    );
    expect(keys).toContain("photo");
    expect(paletteForKind("award").find((item) => item.key === "photo")?.label).toBe(
      "Student award photo",
    );
    expect(keys).not.toContain("qr");
  });
});
