import { describe, expect, it } from "vitest";
import {
  countExistingCoursesBySubject,
  formatDuplicateSubjectTitle,
  nextDuplicateSubjectTitle,
} from "./intake-course-titles";

describe("formatDuplicateSubjectTitle", () => {
  it("appends a number for later occurrences", () => {
    expect(formatDuplicateSubjectTitle("Audit - Jun 2026", 2)).toBe(
      "Audit - Jun 2026 (2)",
    );
  });
});

describe("nextDuplicateSubjectTitle", () => {
  it("numbers the next course after existing intake courses", () => {
    expect(
      nextDuplicateSubjectTitle("Audit - Jun 2026", 1, 0),
    ).toBe("Audit - Jun 2026 (2)");
  });

  it("leaves the first course unnumbered when none exist yet", () => {
    expect(
      nextDuplicateSubjectTitle("Audit - Jun 2026", 0, 0),
    ).toBe("Audit - Jun 2026");
  });
});

describe("countExistingCoursesBySubject", () => {
  it("counts courses by subject id", () => {
    expect(
      countExistingCoursesBySubject([
        { subject: 1 },
        { subject: { id: 1 } },
        { subject: 2 },
      ]),
    ).toEqual({ 1: 2, 2: 1 });
  });
});
