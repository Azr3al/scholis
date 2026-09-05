import { describe, expect, it } from "vitest";

import type { eventType } from "@/types/course";

import { serializeEventsForEditEventsApi } from "./course-schedule";

describe("serializeEventsForEditEventsApi", () => {
  it("omits expanded course and read-only fields on is_edit events", () => {
    const out = serializeEventsForEditEventsApi(
      [
        {
          id: 99,
          is_edit: true,
          title: "Session",
          date: "2026-07-07T00:00:00.000Z",
          time_from: "09:00:00",
          time_to: "10:00:00",
          course: { id: 42, title: "My Course" } as eventType["course"],
          has_checkin: true,
        },
      ],
      42,
    );

    expect(out[0].course).toBeUndefined();
    expect(out[0].has_checkin).toBeUndefined();
    expect(out[0]).toMatchObject({
      id: 99,
      is_edit: true,
      title: "Session",
      time_from: "09:00:00",
      time_to: "10:00:00",
    });
  });

  it("coerces expanded course to PK on new draft events", () => {
    const out = serializeEventsForEditEventsApi(
      [
        {
          id: "new-1",
          title: "New Session",
          date: "2026-08-01T09:00:00+00:00",
          time_from: "09:00:00",
          time_to: "10:00:00",
          course: { id: 42, title: "My Course" } as eventType["course"],
        },
      ],
      42,
    );

    expect(out[0].course).toBe(42);
  });

  it("uses courseId fallback when draft has no course field", () => {
    const out = serializeEventsForEditEventsApi(
      [
        {
          id: "new-2",
          title: "New Session",
          date: "2026-08-01T09:00:00+00:00",
          time_from: "09:00:00",
          time_to: "10:00:00",
        },
      ],
      7,
    );

    expect(out[0].course).toBeUndefined();
  });

  it("omits course on deleted events", () => {
    const out = serializeEventsForEditEventsApi(
      [
        {
          id: 55,
          is_deleted: true,
          title: "Removed",
          date: "2026-07-07T00:00:00.000Z",
          time_from: "09:00:00",
          time_to: "10:00:00",
          course: { id: 42, title: "My Course" } as eventType["course"],
        },
      ],
      42,
    );

    expect(out[0].course).toBeUndefined();
    expect(out[0].is_deleted).toBe(true);
  });

  it("includes is_substitution_reserve on reserve events", () => {
    const out = serializeEventsForEditEventsApi(
      [
        {
          id: "new-3",
          title: "Pack",
          date: "2026-08-11T00:00:00.000Z",
          time_from: "19:00:00",
          time_to: "20:30:00",
          is_substitution_reserve: true,
        },
      ],
      42,
    );

    expect(out[0].is_substitution_reserve).toBe(true);
  });
});
