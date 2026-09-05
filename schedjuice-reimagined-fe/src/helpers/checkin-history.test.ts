import { describe, expect, it } from "vitest";
import { resolveEventYmd } from "@/helpers/attendance-marking";
import {
  tenantHHmmToUtcDateTime,
  utcDateTimeToTenantHHmm,
} from "@/helpers/checkin-history";

const YANGON = "Asia/Yangon";

describe("checkin-history tenant timezone helpers", () => {
  it("formats UTC checkout in tenant timezone for display", () => {
    const utc = "2026-07-14T12:30:00.000Z";
    expect(utcDateTimeToTenantHHmm(utc, YANGON)).toBe("19:00");
  });

  it("round-trips tenant HH:mm through event local date", () => {
    const event = {
      date: "2026-07-14T02:30:00.000Z",
      date_ymd: "2026-07-14",
      time_from: "09:00:00",
      time_to: "10:00:00",
    };
    const eventDate = resolveEventYmd(event, YANGON);
    const hhmm = "19:00";

    const utc = tenantHHmmToUtcDateTime(eventDate, hhmm, YANGON);
    expect(utc).toBe("2026-07-14T12:30:00.000Z");
    expect(utcDateTimeToTenantHHmm(utc, YANGON)).toBe(hhmm);
  });

  it("prefers server date_ymd over UTC date slice for event day", () => {
    const event = {
      date: "2026-07-14T18:30:00.000Z",
      date_ymd: "2026-07-15",
      time_from: "01:00:00",
      time_to: "02:00:00",
    };
    expect(resolveEventYmd(event, YANGON)).toBe("2026-07-15");
  });
});
