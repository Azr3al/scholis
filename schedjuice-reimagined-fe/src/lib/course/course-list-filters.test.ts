import { describe, expect, it } from "vitest";

import {
  buildChatCourseListFilterParams,
  seesAllOrgCourses,
} from "@/lib/course/course-list-filters";
import { courseStatus } from "@/types/course";
import { accountType, role } from "@/types/user";

function u(partial: Partial<accountType> & { roles: role[] }): accountType {
  return { id: 42, permissions: [], ...partial } as accountType;
}

describe("seesAllOrgCourses", () => {
  it("is true for course.view_all permission", () => {
    expect(
      seesAllOrgCourses(
        u({ roles: [role.teacher], permissions: ["course.view_all"] }),
      ),
    ).toBe(true);
  });

  it("is true for admin role without view_all", () => {
    expect(seesAllOrgCourses(u({ roles: [role.admin] }))).toBe(true);
  });

  it("is false for scoped teacher", () => {
    expect(
      seesAllOrgCourses(
        u({ roles: [role.teacher], permissions: ["course.view"] }),
      ),
    ).toBe(false);
  });
});

describe("buildChatCourseListFilterParams", () => {
  it("filters planned and active via status on courses search", () => {
    const params = buildChatCourseListFilterParams(
      u({ roles: [role.teacher], permissions: ["course.view"] }),
    );

    expect(params).toEqual([
      {
        field_name: "user_courses__user_id|created_by",
        operator: "exact",
        value: "42",
      },
      {
        field_name: "status",
        operator: "in",
        value: `${courseStatus.planned},${courseStatus.active}`,
      },
    ]);
  });

  it("omits membership filter for school-wide access", () => {
    const params = buildChatCourseListFilterParams(
      u({ roles: [role.teacher], permissions: ["course.view_all"] }),
    );

    expect(params).toEqual([
      {
        field_name: "status",
        operator: "in",
        value: `${courseStatus.planned},${courseStatus.active}`,
      },
    ]);
  });
});
