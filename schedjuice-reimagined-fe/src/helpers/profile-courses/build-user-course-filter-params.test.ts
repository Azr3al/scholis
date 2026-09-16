import { describe, expect, it } from "vitest";
import { buildUserCourseFilterParams } from "./build-user-course-filter-params";
import { operatorEnum } from "@/types/api";

describe("buildUserCourseFilterParams", () => {
  it("filters by subject user_id", () => {
    expect(
      buildUserCourseFilterParams({
        subjectId: "42",
        scope: "all",
        status: "all",
        viewerTeachingCourseIds: [],
      }),
    ).toEqual({
      filter_params: [
        {
          field_name: "user_id",
          operator: operatorEnum.exact,
          value: "42",
        },
      ],
    });
  });

  it("adds course_id__in for your scope", () => {
    expect(
      buildUserCourseFilterParams({
        subjectId: 7,
        scope: "your",
        status: "all",
        viewerTeachingCourseIds: [10, 20],
      }),
    ).toEqual({
      filter_params: [
        { field_name: "user_id", operator: operatorEnum.exact, value: "7" },
        { field_name: "course_id", operator: operatorEnum.in, value: "10,20" },
      ],
    });
  });

  it("adds course__status for active filter", () => {
    expect(
      buildUserCourseFilterParams({
        subjectId: "1",
        scope: "all",
        status: "active",
        viewerTeachingCourseIds: [],
      }),
    ).toEqual({
      filter_params: [
        { field_name: "user_id", operator: operatorEnum.exact, value: "1" },
        {
          field_name: "course__status",
          operator: operatorEnum.in,
          value: "active,planned",
        },
      ],
    });
  });

  it("combines your scope and active status", () => {
    const result = buildUserCourseFilterParams({
      subjectId: "5",
      scope: "your",
      status: "active",
      viewerTeachingCourseIds: [99],
    });
    expect(result.filter_params).toHaveLength(3);
    expect(result.filter_params.map((p) => p.field_name)).toEqual([
      "user_id",
      "course_id",
      "course__status",
    ]);
  });
});
