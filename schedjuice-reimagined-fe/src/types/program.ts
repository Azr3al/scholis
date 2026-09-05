import * as z from "zod";

export enum CourseCreationMethod {
  manual = "manual",
  intake_based = "intake_based",
}

export enum SubjectStrategy {
  none = "none",
  optional = "optional",
  required = "required",
  multi = "multi",
}

export const programSchema = z.object({
  id: z.number(),
  name: z.string().describe("Program name"),
  description: z.string().optional().nullable().describe("Description"),
  course_creation_method: z
    .nativeEnum(CourseCreationMethod)
    .describe("Course creation method"),
  subject_strategy: z.nativeEnum(SubjectStrategy).describe("Subject strategy"),
  is_session_credit_scheduling: z
    .boolean()
    .optional()
    .default(false)
    .describe("Session-credit scheduling"),
  default_max_sessions: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .default(8)
    .describe("Default max sessions"),
  is_substitution_reserve_enabled: z
    .boolean()
    .optional()
    .default(false)
    .describe("Substitution reserve days"),
  default_substitution_reserve_days: z.coerce
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .default(0)
    .describe("Default reserve days"),
  allow_multiple_sessions_per_day: z
    .boolean()
    .optional()
    .default(false)
    .describe("Multiple sessions per day"),
  is_default: z.boolean().optional(),
  is_protected: z.boolean().optional(),
  is_active: z.boolean().optional().describe("Active"),
  intake_count: z.number().optional(),
});

export const programCreateUpdateSchema = programSchema
  .omit({ id: true, is_default: true, is_protected: true })
  .extend({
    course_creation_method: z
      .nativeEnum(CourseCreationMethod)
      .default(CourseCreationMethod.manual)
      .describe("Course creation method"),
    subject_strategy: z
      .nativeEnum(SubjectStrategy)
      .default(SubjectStrategy.optional)
      .describe(
        "How subjects attach to classes: fixed list, K-12, free-form, or none",
      ),
    is_active: z.boolean().default(true).describe("Active"),
    is_session_credit_scheduling: z
      .boolean()
      .default(false)
      .describe("Session-credit scheduling"),
    default_max_sessions: z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(8)
      .describe("Default max sessions"),
    is_substitution_reserve_enabled: z
      .boolean()
      .default(false)
      .describe("Substitution reserve days"),
    default_substitution_reserve_days: z.coerce
      .number()
      .int()
      .min(0)
      .max(10)
      .default(0)
      .describe("Default reserve days"),
    allow_multiple_sessions_per_day: z
      .boolean()
      .default(false)
      .describe("Multiple sessions per day"),
  });

export type programType = z.infer<typeof programSchema>;

export type programFormValues = z.infer<typeof programCreateUpdateSchema>;

export function programToFormValues(program: programType): programFormValues {
  return {
    name: program.name,
    description: program.description ?? "",
    course_creation_method: program.course_creation_method,
    subject_strategy: program.subject_strategy,
    is_session_credit_scheduling: program.is_session_credit_scheduling ?? false,
    default_max_sessions: program.default_max_sessions ?? 8,
    is_substitution_reserve_enabled:
      program.is_substitution_reserve_enabled ?? false,
    default_substitution_reserve_days:
      program.default_substitution_reserve_days ?? 0,
    allow_multiple_sessions_per_day:
      program.allow_multiple_sessions_per_day ?? false,
    is_active: program.is_active ?? true,
    intake_count: program.intake_count,
  };
}

export const programSubjectSchema = z.object({
  id: z.number(),
  program: z.number(),
  subject: z.union([
    z.number(),
    z.object({ id: z.number(), name: z.string() }),
  ]),
  sort_order: z.number().optional(),
  is_active: z.boolean().optional(),
});

export const programLevelSchema = z.object({
  id: z.number(),
  program: z.number(),
  name: z.string(),
  sort_order: z.number().optional(),
  default_category: z.number().optional().nullable(),
  default_capacity: z.number().optional().nullable(),
  is_active: z.boolean().optional(),
});

export const programLevelSectionSchema = z.object({
  id: z.number(),
  level: z.number(),
  name: z.string(),
  sort_order: z.number().optional(),
  default_teacher: z.number().optional().nullable(),
  default_campus: z.number().optional().nullable(),
  default_capacity: z.number().optional().nullable(),
  is_active: z.boolean().optional(),
});

export const programLevelSubjectSchema = z.object({
  id: z.number(),
  level: z.number(),
  subject: z.union([
    z.number(),
    z.object({ id: z.number(), name: z.string() }),
  ]),
  sort_order: z.number().optional(),
  is_active: z.boolean().optional(),
});

/** Client-side draft types for intake structure step (not persisted until Continue). */
export type DraftSection = {
  clientId: string;
  name: string;
  sort_order: number;
};

export type DraftLevel = {
  clientId: string;
  name: string;
  sort_order: number;
  sections: DraftSection[];
};

export function createDraftSection(
  name: string,
  sortOrder: number,
): DraftSection {
  return {
    clientId: crypto.randomUUID(),
    name,
    sort_order: sortOrder,
  };
}

export function createDraftLevel(name: string, sortOrder: number): DraftLevel {
  return {
    clientId: crypto.randomUUID(),
    name,
    sort_order: sortOrder,
    sections: [createDraftSection("A", 0)],
  };
}

export type SetupStructureLevelPayload = {
  name: string;
  sort_order: number;
  sections: { name: string; sort_order: number }[];
};

export function draftLevelsToSetupPayload(
  levels: DraftLevel[],
): SetupStructureLevelPayload[] {
  return levels.map((level) => ({
    name: level.name.trim(),
    sort_order: level.sort_order,
    sections: level.sections.map((section) => ({
      name: section.name.trim(),
      sort_order: section.sort_order,
    })),
  }));
}
