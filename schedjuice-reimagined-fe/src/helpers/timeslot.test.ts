import { describe, expect, it } from "vitest";
import { getTimeslotUtcRange } from "./timeslot";

describe("getTimeslotUtcRange overnight", () => {
  it("ends on next calendar day in tenant TZ", () => {
    const { utcStart, utcEnd } = getTimeslotUtcRange(
      { date: "2026-07-24", time_from: "22:30", time_to: "00:00" },
      "Asia/Yangon"
    );
    expect(utcEnd.getTime()).toBeGreaterThan(utcStart.getTime());
    expect((utcEnd.getTime() - utcStart.getTime()) / 60000).toBe(90);
  });
});
