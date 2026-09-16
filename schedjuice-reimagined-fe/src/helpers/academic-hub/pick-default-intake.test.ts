import { describe, expect, it } from "vitest";
import { pickDefaultIntake } from "./pick-default-intake";

describe("pickDefaultIntake", () => {
  it("prefers an intake covering today", () => {
    const picked = pickDefaultIntake([
      {
        id: 1,
        name: "Past",
        start_date: "2020-01-01",
        end_date: "2020-12-31",
        program: 7,
      },
      {
        id: 2,
        name: "Current",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        program: 7,
      },
    ]);

    expect(picked?.id).toBe(2);
  });

  it("falls back to the first intake when none cover today", () => {
    const picked = pickDefaultIntake([
      {
        id: 9,
        name: "Future",
        start_date: "2030-01-01",
        end_date: null,
        program: 7,
      },
    ]);

    expect(picked?.id).toBe(9);
  });
});
