import { describe, expect, it } from "vitest";
import {
  flattenCourseEventsFromCoursesQuery,
  profileEventCourseLabel,
  profileEventDisplayTitle,
} from "./user-profile";

describe("profileEventDisplayTitle", () => {

  it("reads course object title", () => {
    expect(
      profileEventDisplayTitle({ course: { id: 1, title: "Math" } }),
    ).toBe("Math");
  });

  it("handles object-shaped title defensively", () => {
    expect(
      profileEventDisplayTitle({
        title: { id: 1, title: "Math" } as unknown as string,
      }),
    ).toBe("Math");
  });

  it("uses plain string title", () => {
    expect(profileEventDisplayTitle({ title: "Session 1" })).toBe("Session 1");
  });

  it("falls back when no label is available", () => {
    expect(profileEventDisplayTitle({})).toBe("Class session");
  });
});

describe("profileEventCourseLabel", () => {
  it("returns null for numeric course id", () => {
    expect(profileEventCourseLabel(42)).toBeNull();
  });

  it("returns title from course object", () => {
    expect(profileEventCourseLabel({ id: 1, title: "Algebra" })).toBe(
      "Algebra",
    );
  });
});

describe("flattenCourseEventsFromCoursesQuery", () => {
  it("sets courseTitle on flattened events", () => {
    const events = flattenCourseEventsFromCoursesQuery([
      {
        id: 10,
        title: "Intro to Math",
        events: [{ id: 1, title: "Session 1", date: "2026-06-23" }],
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].courseTitle).toBe("Intro to Math");
    expect(events[0].course).toEqual({ id: 10, title: "Intro to Math" });
  });
});
