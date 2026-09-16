import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: vi.fn(),
}));

import { makePostRequest } from "@/app/client-api/utils";
import {
  createCourseThenOptionalSchedule,
  createCourseThenSessionCreditSchedule,
  expandSlotsToCourseEvents,
  validateRecurringSlotsForCreate,
} from "./create-course-schedule";

describe("validateRecurringSlotsForCreate", () => {
  it("allows empty slots by default", () => {
    expect(validateRecurringSlotsForCreate([])).toBeNull();
  });

  it("rejects empty slots when requireAtLeastOne", () => {
    expect(
      validateRecurringSlotsForCreate([], { requireAtLeastOne: true }),
    ).toMatch(/at least one day/i);
  });

  it("rejects slot with missing weekday", () => {
    expect(
      validateRecurringSlotsForCreate([
        { weekday: "", time_from: "19:00", time_to: "20:30" },
      ]),
    ).toMatch(/weekday|day/i);
  });

  it("rejects invalid time range", () => {
    expect(
      validateRecurringSlotsForCreate([
        { weekday: "Mon", time_from: "10:00", time_to: "10:00" },
      ]),
    ).toMatch(/time/i);
  });

  it("allows overnight time range", () => {
    expect(
      validateRecurringSlotsForCreate([
        { weekday: "Mon", time_from: "22:30", time_to: "00:00" },
      ]),
    ).toBeNull();
  });
});

describe("expandSlotsToCourseEvents", () => {
  it("expands one weekday across the date span", () => {
    const events = expandSlotsToCourseEvents({
      slots: [{ weekday: "Mon", time_from: "19:00", time_to: "20:30" }],
      startDate: new Date(2026, 6, 6), // Mon Jul 6 2026
      endDate: new Date(2026, 6, 20), // Mon Jul 20 2026
      title: "Algebra",
    });
    const dates = events.map((e) => e.date).sort();
    expect(dates).toEqual(["2026-07-06", "2026-07-13", "2026-07-20"]);
    expect(
      events.every((e) => e.time_from === "19:00" && e.time_to === "20:30"),
    ).toBe(true);
    expect(events.every((e) => e.title === "Algebra")).toBe(true);
  });

  it("expands multiple slots with different times", () => {
    const events = expandSlotsToCourseEvents({
      slots: [
        { weekday: "Mon", time_from: "09:00", time_to: "10:00" },
        { weekday: "Wed", time_from: "14:00", time_to: "15:30" },
      ],
      startDate: new Date(2026, 6, 6),
      endDate: new Date(2026, 6, 9), // Thu
      title: "Science",
    });
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.date === "2026-07-06")?.time_from).toBe("09:00");
    expect(events.find((e) => e.date === "2026-07-08")?.time_from).toBe("14:00");
  });
});

describe("createCourseThenOptionalSchedule", () => {
  beforeEach(() => {
    vi.mocked(makePostRequest).mockReset();
  });

  it("creates only when slots are empty", async () => {
    vi.mocked(makePostRequest).mockResolvedValueOnce({
      data: {
        data: {
          id: 42,
          title: "A",
          start_date: "2026-07-01",
          end_date: "2026-07-31",
        },
      },
    } as never);

    const result = await createCourseThenOptionalSchedule({
      coursePayload: { title: "A" },
      slots: [],
      title: "A",
      startDate: new Date(2026, 6, 1),
      endDate: new Date(2026, 6, 31),
    });

    expect(makePostRequest).toHaveBeenCalledTimes(1);
    expect(makePostRequest).toHaveBeenCalledWith("courses", { title: "A" });
    expect(result).toMatchObject({
      courseId: 42,
      scheduleApplied: false,
    });
    expect(result.scheduleError).toBeUndefined();
  });

  it("posts edit-events after create when slots are set", async () => {
    const created = {
      id: 7,
      title: "B",
      start_date: "2026-07-06",
      end_date: "2026-07-20",
    };
    vi.mocked(makePostRequest)
      .mockResolvedValueOnce({ data: { data: created } } as never)
      .mockResolvedValueOnce({ data: { data: [] } } as never);

    const slots = [{ weekday: "Mon", time_from: "19:00", time_to: "20:30" }];
    const result = await createCourseThenOptionalSchedule({
      coursePayload: { title: "B" },
      slots,
      title: "B",
      startDate: new Date(2026, 6, 6),
      endDate: new Date(2026, 6, 20),
    });

    expect(makePostRequest).toHaveBeenNthCalledWith(1, "courses", { title: "B" });
    expect(makePostRequest).toHaveBeenNthCalledWith(
      2,
      "courses/7/edit-events",
      expect.objectContaining({
        events: expect.any(Array),
        course: expect.any(Object),
      }),
    );
    const body = vi.mocked(makePostRequest).mock.calls[1][1] as {
      events: Array<{ date: string }>;
    };
    expect(body.events.length).toBeGreaterThan(0);
    expect(result).toMatchObject({ courseId: 7, scheduleApplied: true });
  });

  it("returns scheduleError and still yields courseId when edit-events fails", async () => {
    vi.mocked(makePostRequest)
      .mockResolvedValueOnce({
        data: {
          data: {
            id: 9,
            title: "C",
            start_date: "2026-07-06",
            end_date: "2026-07-20",
          },
        },
      } as never)
      .mockRejectedValueOnce(new Error("boom"));

    const result = await createCourseThenOptionalSchedule({
      coursePayload: { title: "C" },
      slots: [{ weekday: "Mon", time_from: "19:00", time_to: "20:30" }],
      title: "C",
      startDate: new Date(2026, 6, 6),
      endDate: new Date(2026, 6, 20),
    });

    expect(result.courseId).toBe(9);
    expect(result.scheduleApplied).toBe(false);
    expect(result.scheduleError).toBe(
      "Course created, but sessions could not be added",
    );
  });

  it("does not create when slots are invalid", async () => {
    await expect(
      createCourseThenOptionalSchedule({
        coursePayload: { title: "D" },
        slots: [{ weekday: "Mon", time_from: "10:00", time_to: "10:00" }],
        title: "D",
        startDate: new Date(2026, 6, 6),
        endDate: new Date(2026, 6, 20),
      }),
    ).rejects.toThrow(/time/i);
    expect(makePostRequest).not.toHaveBeenCalled();
  });
});

describe("createCourseThenSessionCreditSchedule", () => {
  beforeEach(() => {
    vi.mocked(makePostRequest).mockReset();
  });

  it("posts max_sessions and one event per picked date", async () => {
    vi.mocked(makePostRequest)
      .mockResolvedValueOnce({
        data: {
          data: {
            id: 11,
            title: "Pack",
            start_date: "2026-08-03",
            end_date: "2026-08-10",
          },
        },
      } as never)
      .mockResolvedValueOnce({ data: { data: [] } } as never);

    await createCourseThenSessionCreditSchedule({
      coursePayload: { title: "Pack", max_sessions: 2 },
      picks: [
        {
          clientId: "pick-1",
          date: "2026-08-03",
          time_from: "19:00",
          time_to: "20:30",
          overridden: false,
        },
        {
          clientId: "pick-2",
          date: "2026-08-10",
          time_from: "09:00",
          time_to: "10:00",
          overridden: true,
        },
      ],
      title: "Pack",
    });

    expect(makePostRequest).toHaveBeenNthCalledWith(
      1,
      "courses",
      expect.objectContaining({
        max_sessions: 2,
        start_date: "2026-08-03",
        end_date: "2026-08-10",
      }),
    );
    const body = vi.mocked(makePostRequest).mock.calls[1][1] as {
      events: Array<{ date: string; time_from: string }>;
    };
    expect(body.events.map((e) => e.date)).toEqual(["2026-08-03", "2026-08-10"]);
    expect(body.events.find((e) => e.date === "2026-08-10")?.time_from).toBe(
      "09:00",
    );
  });

  it("posts reserve events with is_substitution_reserve", async () => {
    vi.mocked(makePostRequest)
      .mockResolvedValueOnce({
        data: {
          data: {
            id: 12,
            title: "Pack",
            start_date: "2026-08-03",
            end_date: "2026-08-11",
          },
        },
      } as never)
      .mockResolvedValueOnce({ data: { data: [] } } as never);

    await createCourseThenSessionCreditSchedule({
      coursePayload: { title: "Pack", max_sessions: 2 },
      picks: [
        {
          clientId: "pick-1",
          date: "2026-08-03",
          time_from: "19:00",
          time_to: "20:30",
          overridden: false,
        },
        {
          clientId: "pick-2",
          date: "2026-08-10",
          time_from: "19:00",
          time_to: "20:30",
          overridden: false,
        },
        {
          clientId: "pick-3",
          date: "2026-08-11",
          time_from: "19:00",
          time_to: "20:30",
          overridden: false,
          isSubstitutionReserve: true,
        },
      ],
      title: "Pack",
    });

    const body = vi.mocked(makePostRequest).mock.calls[1][1] as {
      events: Array<{ date: string; is_substitution_reserve?: boolean }>;
    };
    expect(body.events).toHaveLength(3);
    expect(
      body.events.find((e) => e.date === "2026-08-11")?.is_substitution_reserve,
    ).toBe(true);
  });

  it("throws when teaching pick count is not exactly max", async () => {
    await expect(
      createCourseThenSessionCreditSchedule({
        coursePayload: { title: "Pack", max_sessions: 8 },
        picks: [
          {
            clientId: "pick-1",
            date: "2026-08-03",
            time_from: "19:00",
            time_to: "20:30",
            overridden: false,
          },
        ],
        title: "Pack",
      }),
    ).rejects.toThrow(/exactly/i);
    expect(makePostRequest).not.toHaveBeenCalled();
  });
});
