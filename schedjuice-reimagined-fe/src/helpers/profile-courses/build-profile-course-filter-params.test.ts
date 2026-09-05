import { describe, expect, it } from "vitest";
import { buildProfileCourseFilterParams } from "./build-profile-course-filter-params";
import { operatorEnum } from "@/types/api";

describe("buildProfileCourseFilterParams", () => {
  it("scopes to subject enrollments", () => {
    expect(
      buildProfileCourseFilterParams({
        subjectId: "42",
        scope: "all",
        sharedIds: [],
      }),
    ).toEqual({
      filter_params: [
        {
          field_name: "user_courses__user_id",
          operator: operatorEnum.exact,
          value: "42",
        },
      ],
    });
  });

  it("adds id__in when scope is your and sharedIds present", () => {
    expect(
      buildProfileCourseFilterParams({
        subjectId: 7,
        scope: "your",
        sharedIds: [10, 20],
      }),
    ).toEqual({
      filter_params: [
        {
          field_name: "user_courses__user_id",
          operator: operatorEnum.exact,
          value: "7",
        },
        {
          field_name: "id",
          operator: operatorEnum.in,
          value: "10,20",
        },
      ],
    });
  });

  it("omits id__in when scope is your but sharedIds empty", () => {
    const result = buildProfileCourseFilterParams({
      subjectId: "1",
      scope: "your",
      sharedIds: [],
    });
    expect(result.filter_params).toHaveLength(1);
    expect(result.filter_params[0].field_name).toBe("user_courses__user_id");
  });
});
