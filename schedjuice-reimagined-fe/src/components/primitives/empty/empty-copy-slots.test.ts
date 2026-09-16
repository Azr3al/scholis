import { describe, it, expect } from "vitest";
import { plainTextFromSlots, type EmptyCopySlots } from "./empty-copy-slots";

describe("plainTextFromSlots", () => {
  it("joins slots with middle-dot separator", () => {
    const slots: EmptyCopySlots = {
      enBefore: "Nothing ",
      enHighlight: "here",
      enAfter: " yet",
      myBefore: "ဘာမှ ",
      myHighlight: "မရှိ",
      myAfter: " သေးပါ",
    };
    expect(plainTextFromSlots(slots)).toBe(
      "Nothing here yet · ဘာမှ မရှိ သေးပါ",
    );
  });

  it("omits empty optional slots", () => {
    const slots: EmptyCopySlots = {
      enHighlight: "users",
      enAfter: " found",
      myHighlight: "မရှိ",
      myAfter: "ပါ",
    };
    expect(plainTextFromSlots(slots)).toBe("users found · မရှိပါ");
  });
});
