import { describe, expect, it } from "vitest";
import {
  CourseCreationMethod,
  SubjectStrategy,
} from "@/types/program";
import { sanitizeCoursePayloadForApiWrite } from "./course-program-validation";

describe("sanitizeCoursePayloadForApiWrite", () => {
  it("coerces expanded program and intake FKs to primary keys", () => {
    const result = sanitizeCoursePayloadForApiWrite({
      id: 10,
      title: "Math 101",
      program: {
        id: 1,
        name: "General",
        course_creation_method: CourseCreationMethod.intake_based,
        subject_strategy: SubjectStrategy.optional,
      },
      intake: { id: 2, name: "Jan 2026" },
      is_recurring: true,
      repeat_every: ["Mon", "Wed"],
    });

    expect(result.program).toBe(1);
    expect(result.intake).toBe(2);
    expect(result.is_recurring).toBe(true);
    expect(result.repeat_every).toEqual(["Mon", "Wed"]);
  });

  it("strips read-only nested relations and computed fields", () => {
    const result = sanitizeCoursePayloadForApiWrite({
      id: 10,
      program: { id: 1, name: "General" },
      user_courses: [{ id: 1, user: { id: 5, name: "Teacher" } }],
      events: [{ id: 99, title: "Session" }],
      created_by: { id: 3, name: "Admin", email: "admin@test.com" },
      primary_teacher: { id: 5, name: "Teacher", email: "t@test.com" },
      student_count: 12,
      has_teams_meeting_organizer: true,
    });

    expect(result).not.toHaveProperty("user_courses");
    expect(result).not.toHaveProperty("events");
    expect(result).not.toHaveProperty("created_by");
    expect(result).not.toHaveProperty("primary_teacher");
    expect(result).not.toHaveProperty("student_count");
    expect(result).not.toHaveProperty("has_teams_meeting_organizer");
    expect(result.program).toBe(1);
  });

  it("drops intake for non-intake-based programs", () => {
    const result = sanitizeCoursePayloadForApiWrite({
      program: {
        id: 1,
        name: "Manual program",
        course_creation_method: CourseCreationMethod.manual,
        subject_strategy: SubjectStrategy.optional,
      },
      intake: { id: 2, name: "Jan 2026" },
    });

    expect(result.program).toBe(1);
    expect(result).not.toHaveProperty("intake");
  });

  it("drops subject for none/multi subject strategies", () => {
    const result = sanitizeCoursePayloadForApiWrite({
      program: {
        id: 1,
        name: "K-12",
        course_creation_method: CourseCreationMethod.manual,
        subject_strategy: SubjectStrategy.multi,
      },
      subject: { id: 7, name: "Physics" },
      level: { id: 3, name: "Grade 10" },
    });

    expect(result.program).toBe(1);
    expect(result).not.toHaveProperty("subject");
    expect(result.level).toBe(3);
  });
});
