import { Controller } from "react-hook-form";
import { relationFkToPkNullable } from "@/helpers/relation-fk";
import {
  CourseCreationMethod,
  programType,
  SubjectStrategy,
} from "@/types/program";
import {
  COURSE_PROGRAM_SCOPED_FIELD_KEYS,
  isCourseProgramScopedFieldKey,
} from "@/types/course";

const COURSE_FK_KEYS = [
  "program",
  "intake",
  "level",
  "section",
  "subject",
  "category",
  "payment_plan",
] as const;

const COURSE_WRITE_STRIP_KEYS = [
  "user_courses",
  "events",
  "course_subjects",
  "created_by",
  "primary_teacher",
  "payment_plans",
  "course_histories",
  "join_requests",
  "payment_courses",
  "student_count",
  "teacher_count",
  "main_teacher_count",
  "assistant_teacher_count",
  "first_event_time_from",
  "first_event_time_to",
  "has_teams_meeting_organizer",
  "teams_meeting_organizer_unresolved",
  "category_id",
  "payment_plan_id",
] as const;

function resolveProgramFromCourse(
  course: Record<string, unknown>,
): programType | undefined {
  const program = course.program;
  if (program && typeof program === "object" && "id" in program) {
    return program as programType;
  }
  if (typeof program === "number" && Number.isFinite(program)) {
    return { id: program } as programType;
  }
  return undefined;
}

export function shouldShowCourseProgramField(
  fieldKey: string,
  program: programType | undefined,
): boolean {
  if (!isCourseProgramScopedFieldKey(fieldKey)) {
    return true;
  }
  if (!program) {
    return fieldKey === "program";
  }

  switch (fieldKey) {
    case "program":
      return true;
    case "intake":
      return program.course_creation_method === CourseCreationMethod.intake_based;
    case "subject":
      return (
        program.subject_strategy !== SubjectStrategy.none &&
        program.subject_strategy !== SubjectStrategy.multi
      );
    case "level":
      return true;
    case "section":
      return true;
    default:
      return true;
  }
}

export function isCourseProgramFieldRequired(
  fieldKey: string,
  program: programType | undefined,
): boolean {
  if (!program) return false;
  if (
    fieldKey === "intake" &&
    program.course_creation_method === CourseCreationMethod.intake_based
  ) {
    return true;
  }
  if (
    fieldKey === "subject" &&
    program.subject_strategy === SubjectStrategy.required
  ) {
    return true;
  }
  return false;
}

export function validateCourseProgramFields(
  data: Record<string, unknown>,
  program: programType | undefined,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!program) {
    errors.program = "Select a program to continue.";
    return errors;
  }

  if (
    program.course_creation_method === CourseCreationMethod.intake_based &&
    (data.intake == null || data.intake === "")
  ) {
    errors.intake = "Intake is required for intake-based programs.";
  }

  if (
    program.subject_strategy === SubjectStrategy.required &&
    (data.subject == null || data.subject === "")
  ) {
    errors.subject = "Subject is required for this program.";
  }

  return errors;
}

export function sanitizeCoursePayloadForProgram<T extends Record<string, unknown>>(
  data: T,
  program: programType | undefined,
): T {
  const payload: Record<string, unknown> = { ...data };

  if (program?.id) {
    payload.program = program.id;
  }

  if (
    program?.subject_strategy === SubjectStrategy.none ||
    program?.subject_strategy === SubjectStrategy.multi
  ) {
    delete payload.subject;
  }

  if (program?.course_creation_method !== CourseCreationMethod.intake_based) {
    delete payload.intake;
  }

  return payload as T;
}

export function sanitizeCoursePayloadForApiWrite<T extends Record<string, unknown>>(
  course: T,
): T {
  const payload: Record<string, unknown> = { ...course };

  for (const key of COURSE_WRITE_STRIP_KEYS) {
    delete payload[key];
  }

  for (const key of COURSE_FK_KEYS) {
    if (key in payload) {
      payload[key] = relationFkToPkNullable(payload[key]);
    }
  }

  return sanitizeCoursePayloadForProgram(
    payload as T,
    resolveProgramFromCourse(course),
  );
}

export function buildCourseFormFieldOrder(
  orgFieldOrder: string[],
  options?: { includeProgramField?: boolean },
): string[] {
  const includeProgram = options?.includeProgramField ?? true;
  const scoped = COURSE_PROGRAM_SCOPED_FIELD_KEYS.filter(
    (key) => includeProgram || key !== "program",
  );
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const key of scoped) {
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(key);
    }
  }
  for (const key of orgFieldOrder) {
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(key);
    }
  }
  return merged;
}

export function buildActiveCourseFieldOrder(
  stepFields: string[],
  orgFieldOrder: string[],
  options?: { includeProgramField?: boolean },
): string[] {
  const effectiveOrder = buildCourseFormFieldOrder(orgFieldOrder, options);
  const effectiveSet = new Set(effectiveOrder);

  return stepFields.filter((field) => {
    if (isCourseProgramScopedFieldKey(field)) {
      return effectiveSet.has(field);
    }
    return effectiveSet.has(field);
  });
}

export function getProgramDependentFieldsToClear(
  program: programType | undefined,
): Array<"intake" | "subject" | "level" | "section"> {
  const fields: Array<"intake" | "subject" | "level" | "section"> = [
    "intake",
    "subject",
    "level",
    "section",
  ];
  if (!program) return fields;
  return fields.filter((field) => {
    if (field === "intake") {
      return program.course_creation_method !== CourseCreationMethod.intake_based;
    }
    if (field === "subject") {
      return (
        program.subject_strategy === SubjectStrategy.none ||
        program.subject_strategy === SubjectStrategy.multi
      );
    }
    return false;
  });
}
