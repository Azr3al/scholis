import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchTeachingCourseIds } from "@/lib/home/fetch-teaching-course-ids";

vi.mock("@/app/client-api/utils", () => ({
  searchEntities: vi.fn(),
}));

import { searchEntities } from "@/app/client-api/utils";

const mockSearchEntities = vi.mocked(searchEntities);

describe("fetchTeachingCourseIds", () => {
  beforeEach(() => {
    mockSearchEntities.mockReset();
  });

  it("returns unique course ids for MT and AT assignments only", async () => {
    mockSearchEntities.mockResolvedValue({
      data: {
        data: [
          { course: { id: 10 } },
          { course: 20 },
          { course: { id: 10 } },
          { course: null },
        ],
      },
    } as Awaited<ReturnType<typeof searchEntities>>);

    const ids = await fetchTeachingCourseIds(7);

    expect(ids).toEqual([10, 20]);
    expect(mockSearchEntities).toHaveBeenCalledWith(
      "user-courses",
      { size: -1, fields: ["course"] },
      expect.objectContaining({
        filter_params: expect.arrayContaining([
          { field_name: "user_id", operator: "exact", value: "7" },
          {
            field_name: "assigned_as_role__seniority",
            operator: "in",
            value: "MAIN_TEACHER,ASSISTANT_TEACHER",
          },
        ]),
      }),
    );
  });
});
