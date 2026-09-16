import { describe, expect, it } from "vitest";

import { ADD_AWARD_BUTTON_CLASS } from "./add-award-visibility";

describe("ADD_AWARD_BUTTON_CLASS", () => {
  it("keeps the control in flow and fades only on hover-capable pointers", () => {
    expect(ADD_AWARD_BUTTON_CLASS).toContain("opacity-0");
    expect(ADD_AWARD_BUTTON_CLASS).toContain("group-hover:opacity-100");
    expect(ADD_AWARD_BUTTON_CLASS).toContain("focus-within:opacity-100");
    expect(ADD_AWARD_BUTTON_CLASS).toContain("[@media(hover:none)]:opacity-100");
    expect(ADD_AWARD_BUTTON_CLASS).not.toContain("hidden");
    expect(ADD_AWARD_BUTTON_CLASS).not.toContain("hover:scale");
  });
});
