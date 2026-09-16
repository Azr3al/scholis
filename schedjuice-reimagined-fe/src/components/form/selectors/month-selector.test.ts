import { describe, expect, it } from "vitest";
import { MONTH_TYPE_FM, MONTH_TYPE_HM } from "@/helpers/date";
import { getMonthSelectorOptions } from "./month-selector";

describe("getMonthSelectorOptions", () => {
  it("returns full month names for FM and null/undefined", () => {
    expect(getMonthSelectorOptions(MONTH_TYPE_FM)[0]).toEqual({
      label: "January",
      value: "0",
    });
    expect(getMonthSelectorOptions(null)[0].label).toBe("January");
    expect(getMonthSelectorOptions(undefined)[0].label).toBe("January");
    expect(getMonthSelectorOptions(MONTH_TYPE_FM)[11].label).toBe("December");
  });

  it("returns adjacent-month ranges for HM", () => {
    const options = getMonthSelectorOptions(MONTH_TYPE_HM);
    expect(options[0]).toEqual({ label: "Jan - Feb", value: "0" });
    expect(options[1]).toEqual({ label: "Feb - Mar", value: "1" });
    expect(options[11]).toEqual({ label: "Dec - Jan", value: "11" });
    expect(options).toHaveLength(12);
  });
});
