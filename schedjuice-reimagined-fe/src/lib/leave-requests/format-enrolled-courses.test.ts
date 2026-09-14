import { describe, expect, it } from "vitest";

import { formatEnrolledCourses } from "./format-enrolled-courses";

describe("formatEnrolledCourses", () => {
  it("returns null when there are no courses", () => {
    expect(formatEnrolledCourses(undefined)).toBeNull();
    expect(formatEnrolledCourses([])).toBeNull();
  });

  it("joins one or two course titles", () => {
    expect(
      formatEnrolledCourses([{ id: 1, title: "Math" }]),
    ).toBe("Math");
    expect(
      formatEnrolledCourses([
        { id: 1, title: "Math" },
        { id: 2, title: "Science" },
      ]),
    ).toBe("Math · Science");
  });

  it("truncates three or more courses", () => {
    expect(
      formatEnrolledCourses([
        { id: 1, title: "Math" },
        { id: 2, title: "Science" },
        { id: 3, title: "History" },
      ]),
    ).toBe("Math · Science · +1 more");
  });
});
