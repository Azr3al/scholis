import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchEntities } = vi.hoisted(() => ({
  searchEntities: vi.fn(),
}));

vi.mock("@/app/client-api/utils", () => ({
  searchEntities,
}));

describe("fetchCourseMainTeacher", () => {
  beforeEach(() => {
    searchEntities.mockReset();
  });

  it("returns the main teacher name and signature url", async () => {
    searchEntities.mockResolvedValue({
      data: {
        data: [
          {
            user: {
              name: "Daw Su",
              user_signature_url: "https://cdn.example/mt.png",
            },
          },
        ],
      },
    });
    const { fetchCourseMainTeacher } = await import("./course-main-teacher");
    await expect(fetchCourseMainTeacher(7)).resolves.toEqual({
      name: "Daw Su",
      signatureUrl: "https://cdn.example/mt.png",
    });
    expect(searchEntities).toHaveBeenCalledWith(
      "user-courses",
      expect.objectContaining({ expand: ["user", "assigned_as_role"] }),
      expect.objectContaining({
        filter_params: expect.arrayContaining([
          expect.objectContaining({ field_name: "course_id", value: "7" }),
          expect.objectContaining({
            field_name: "assigned_as_role__seniority",
            value: "MAIN_TEACHER",
          }),
        ]),
      }),
    );
  });
});
