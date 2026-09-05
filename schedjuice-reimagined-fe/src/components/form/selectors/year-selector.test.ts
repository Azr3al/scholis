import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildYearOptions,
  DEFAULT_YEARS_BACK,
  EXAM_SESSION_YEARS_AHEAD,
} from "./year-selector";

describe("buildYearOptions", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to the current year as the maximum", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00Z"));

    const options = buildYearOptions();
    expect(options[0]?.value).toBe("2026");
    expect(options).toHaveLength(DEFAULT_YEARS_BACK);
  });

  it("includes two future years for exam session selectors", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00Z"));

    const options = buildYearOptions(EXAM_SESSION_YEARS_AHEAD);
    expect(options.slice(0, 3).map((o) => o.value)).toEqual([
      "2028",
      "2027",
      "2026",
    ]);
    expect(options).toHaveLength(DEFAULT_YEARS_BACK + EXAM_SESSION_YEARS_AHEAD);
  });
});
