import { describe, expect, it } from "vitest";
import {
  courseRecordNavActive,
  COURSE_RECORD_NAV_ENTRIES,
  isCourseHubRoute,
  visibleCourseRecordNavSections,
} from "./course-record-nav";
import { role, type accountType } from "@/types/user";
import type { courseType } from "@/types/course";

const ID = "42";

const course = { id: ID } as unknown as courseType;
const tenant = null;

function userWithPermissions(permissions: string[]): accountType {
  return { id: 1, roles: [role.teacher], permissions } as accountType;
}

describe("visibleCourseRecordNavSections", () => {
  it("keeps overview separate from grouped sections", () => {
    const user = userWithPermissions([
      "attendance.mark",
      "assignment.grade",
      "grade.manage",
    ]);
    const { overview, groups } = visibleCourseRecordNavSections(user, course, tenant);

    expect(overview?.id).toBe("overview");
    expect(groups.some((group) => group.entries.some((e) => e.id === "overview"))).toBe(
      false,
    );
  });

  it("omits permission-gated entries from groups", () => {
    const user = userWithPermissions([]);
    const { groups } = visibleCourseRecordNavSections(user, course, tenant);

    const academic = groups.find((group) => group.id === "academic");
    expect(academic?.entries.map((entry) => entry.id)).toEqual([
      "assessments",
      "materials",
    ]);
    expect(groups.find((group) => group.id === "roster")?.entries).toHaveLength(4);
  });
});

describe("isCourseHubRoute", () => {
  it("matches hub section base paths", () => {
    expect(isCourseHubRoute(`/courses/${ID}`, ID)).toBe(true);
    expect(isCourseHubRoute(`/courses/${ID}/schedule`, ID)).toBe(true);
    expect(isCourseHubRoute(`/courses/${ID}/materials`, ID)).toBe(true);
  });

  it("rejects sub-routes and nested hub paths", () => {
    expect(isCourseHubRoute(`/courses/${ID}/edit`, ID)).toBe(false);
    expect(isCourseHubRoute(`/courses/${ID}/attendance/marking/1`, ID)).toBe(false);
    expect(isCourseHubRoute(`/courses/${ID}/materials/123`, ID)).toBe(false);
  });

  it("keeps hub chrome on grading nested routes", () => {
    expect(isCourseHubRoute(`/courses/${ID}/grading/awards`, ID)).toBe(true);
    expect(isCourseHubRoute(`/courses/${ID}/grading/mark-sheets`, ID)).toBe(true);
  });
});

describe("courseRecordNavActive", () => {
  it("highlights overview on base path only", () => {
    expect(courseRecordNavActive("overview", `/courses/${ID}`, ID)).toBe(true);
    expect(courseRecordNavActive("overview", `/courses/${ID}/schedule`, ID)).toBe(
      false,
    );
  });

  it("groups attendance family paths", () => {
    expect(courseRecordNavActive("attendance", `/courses/${ID}/attendance`, ID)).toBe(
      true,
    );
    expect(
      courseRecordNavActive("attendance", `/courses/${ID}/checkin-history/-1`, ID),
    ).toBe(true);
    expect(
      courseRecordNavActive("attendance", `/courses/${ID}/meeting-attendance`, ID),
    ).toBe(true);
    expect(courseRecordNavActive("attendance", `/courses/${ID}/grading`, ID)).toBe(
      false,
    );
  });

  it("highlights grading on mark sheet sub-routes", () => {
    expect(
      courseRecordNavActive("grading", `/courses/${ID}/grading/mark-sheets`, ID),
    ).toBe(true);
    expect(
      courseRecordNavActive("grading", `/courses/${ID}/grading/mark-sheets/new`, ID),
    ).toBe(true);
  });
});
