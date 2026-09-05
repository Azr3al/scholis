import { beforeEach, describe, expect, it, vi } from "vitest";

import { userCoursesKeys } from "@/sdk/keys/user-courses";

const { invalidateQueries, invalidateCourseSummaryCaches } = vi.hoisted(() => ({
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
  invalidateCourseSummaryCaches: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/query", () => ({
  queryClient: {
    invalidateQueries,
  },
}));

vi.mock("@/lib/course-cache", () => ({
  invalidateCourseSummaryCaches,
}));

describe("invalidateCourseStudentRosterQueries", () => {
  beforeEach(() => {
    invalidateQueries.mockClear();
    invalidateCourseSummaryCaches.mockClear();
  });

  it("invalidates user-courses list keys, not the legacy searchuser-courses key", async () => {
    const { invalidateCourseStudentRosterQueries } = await import(
      "./use-course-student-roster"
    );

    invalidateCourseStudentRosterQueries(42);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: userCoursesKeys.all,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["courseMembershipHistory", "42"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["fetchStudents", 42],
    });
    expect(invalidateCourseSummaryCaches).toHaveBeenCalled();

    for (const [arg] of invalidateQueries.mock.calls) {
      expect(arg?.queryKey?.[0]).not.toBe("searchuser-courses");
    }
  });
});
