import { describe, expect, it } from "vitest";
import {
  canAssignSelfToCourseEvents,
  canAssignTeacherToEvents,
  canEditCourse,
  canManageCourseFeed,
  canManageCourseRoster,
  canManageCourseSchedule,
} from "@/helpers/authorization";
import { role, type accountType } from "@/types/user";
import { assignedAsEnum, seniorityEnum } from "@/types/course";

describe("course status action visibility", () => {
  const teacherOnCourse: accountType = {
    id: 42,
    roles: [role.teacher],
    permissions: ["course.view", "course.update", "course.manage_content"],
  } as accountType;

  const teacherWithRosterPermission: accountType = {
    id: 42,
    roles: [role.teacher],
    permissions: ["course.view", "course.update", "course.manage_members"],
  } as accountType;

  const teacherWithBothPermissions: accountType = {
    id: 42,
    roles: [role.teacher],
    permissions: [
      "course.view",
      "course.update",
      "course.manage_content",
      "course.manage_members",
    ],
  } as accountType;

  const manager: accountType = {
    id: 1,
    roles: [role.manager],
    permissions: ["course.manage_members", "course.manage_all"],
  } as accountType;

  const admin: accountType = {
    id: 2,
    roles: [role.admin],
    permissions: ["course.manage_members", "course.manage_all"],
  } as accountType;

  const student: accountType = {
    id: 99,
    roles: [role.student],
  } as accountType;

  it("allows assigned teachers and managers to edit course status", () => {
    expect(canEditCourse(teacherOnCourse, [42])).toBe(true);
    expect(canEditCourse(manager, [])).toBe(true);
    expect(canManageCourseRoster(admin, [])).toBe(true);
  });

  it("denies roster management for teachers without course.manage_members", () => {
    expect(canManageCourseRoster(teacherOnCourse, [42])).toBe(false);
    expect(canManageCourseRoster(teacherOnCourse, [], 42)).toBe(false);
  });

  it("allows roster management for teachers granted course.manage_members", () => {
    expect(canManageCourseRoster(teacherWithRosterPermission, [42])).toBe(true);
    expect(canManageCourseRoster(teacherWithRosterPermission, [], 42)).toBe(
      true,
    );
  });

  it("allows schedule management for teachers with course.manage_content on assigned course", () => {
    expect(canManageCourseSchedule(teacherOnCourse, [42])).toBe(true);
    expect(canManageCourseSchedule(teacherOnCourse, [], 42)).toBe(true);
    expect(canManageCourseRoster(teacherOnCourse, [42])).toBe(false);
  });

  it("allows both schedule and roster when teacher has both permissions", () => {
    expect(canManageCourseSchedule(teacherWithBothPermissions, [42])).toBe(
      true,
    );
    expect(canManageCourseRoster(teacherWithBothPermissions, [42])).toBe(true);
  });

  it("denies schedule management for unassigned teachers", () => {
    expect(canManageCourseSchedule(teacherOnCourse, [7])).toBe(false);
  });

  it("denies students and unassigned teachers", () => {
    expect(canEditCourse(student, [42])).toBe(false);
    expect(canEditCourse(teacherOnCourse, [7])).toBe(false);
  });

  it("allows course creators who are not on the teacher roster", () => {
    expect(canEditCourse(teacherOnCourse, [7], 42)).toBe(true);
  });
});

describe("teacher event assignment permissions", () => {
  const teacherWithRosterPermission: accountType = {
    id: 42,
    roles: [role.teacher],
    permissions: ["course.view", "course.manage_members"],
  } as accountType;

  const teacherWithSelfAssign: accountType = {
    id: 42,
    roles: [role.teacher],
    permissions: ["course.manage_members", "course.assign_self_events"],
  } as accountType;

  const manager: accountType = {
    id: 1,
    roles: [role.manager],
    permissions: ["course.manage_members", "course.manage_all"],
  } as accountType;

  it("denies self-assign for teachers without course.assign_self_events", () => {
    expect(canAssignSelfToCourseEvents(teacherWithRosterPermission)).toBe(false);
    expect(canAssignTeacherToEvents(teacherWithRosterPermission, 42)).toBe(false);
  });

  it("allows self-assign when teacher has course.assign_self_events", () => {
    expect(canAssignSelfToCourseEvents(teacherWithSelfAssign)).toBe(true);
    expect(canAssignTeacherToEvents(teacherWithSelfAssign, 42)).toBe(true);
  });

  it("allows assigning other teachers with course.manage_members only", () => {
    expect(canAssignTeacherToEvents(teacherWithRosterPermission, 7)).toBe(true);
  });

  it("allows manager self-assign via course.manage_all", () => {
    expect(canAssignSelfToCourseEvents(manager)).toBe(true);
    expect(canAssignTeacherToEvents(manager, 1)).toBe(true);
  });
});

describe("course feed permissions", () => {
  const courseWithMtTeacher = {
    user_courses: [
      {
        assigned_as: assignedAsEnum.teacher,
        user: { id: 42 },
        assigned_as_role: { seniority: seniorityEnum.MAIN_TEACHER },
      },
    ],
  };

  const courseWithOversightTeacher = {
    user_courses: [
      {
        assigned_as: assignedAsEnum.teacher,
        user: { id: 42 },
        assigned_as_role: { seniority: seniorityEnum.OTHER },
      },
    ],
  };

  const teachingTeacher: accountType = {
    id: 42,
    roles: [role.teacher],
    permissions: ["course.view", "course.update"],
  } as accountType;

  const manager: accountType = {
    id: 1,
    roles: [role.manager],
    permissions: ["course.manage_all"],
  } as accountType;

  const admin: accountType = {
    id: 2,
    roles: [role.admin],
    permissions: [],
  } as unknown as accountType;

  it("allows MAIN_TEACHER on course without course.manage_content", () => {
    expect(canManageCourseFeed(teachingTeacher, courseWithMtTeacher)).toBe(true);
  });

  it("denies oversight teacher without course.manage_content", () => {
    expect(canManageCourseFeed(teachingTeacher, courseWithOversightTeacher)).toBe(
      false,
    );
  });

  it("allows manager and admin regardless of roster", () => {
    expect(canManageCourseFeed(manager, courseWithOversightTeacher)).toBe(true);
    expect(canManageCourseFeed(admin, courseWithOversightTeacher)).toBe(true);
  });
});
