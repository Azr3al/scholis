// @ts-nocheck
// we are not getting any fucking type safety because of some ts shits
import * as z from "zod";
import { accountSchema } from "./user";

export enum assignedAsEnum {
  teacher = "teacher",
  student = "student",
}
export enum seniorityEnum {
  MAIN_TEACHER = "MAIN_TEACHER",
  ASSISTANT_TEACHER = "ASSISTANT_TEACHER",
  OTHER = "OTHER"
}

const assignedAsRoleSchema = z.object({
  id: z.number(),
  name: z.string().max(256),
  is_collision_enabled: z
    .boolean()
    .default(true)
    .describe("Enable Event Collision"),
  seniority: z.nativeEnum(seniorityEnum).default(seniorityEnum.OTHER).describe("System Role"),
  is_substitute: z
    .boolean()
    .default(false)
    .describe("Substitute role"),
});

const assignedAsRoleCreateSchema = assignedAsRoleSchema.omit({
  id: true,
}).superRefine((data, ctx) => {
  if (
    data.is_substitute &&
    data.seniority !== seniorityEnum.MAIN_TEACHER &&
    data.seniority !== seniorityEnum.ASSISTANT_TEACHER
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["seniority"],
      message:
        "Substitute roles require Main Teacher or Assistant Teacher system role.",
    });
  }
});

const userCoursesSchema = z.object({
  user: z.number(),
  course: z.lazy(() => courseSchema.partial().or(z.number())),
  assigned_as: z.nativeEnum(assignedAsEnum),
});

const categorySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().optional(),
  sort_order: z.coerce.number().optional().default(0),
  is_payment_assignment_eligible: z.boolean().optional().default(false).describe("Payment Assignment Eligible"),
});
const categoryCreateUpdateSchema = categorySchema.omit({
  id: true,
});
export type categoryType = z.infer<typeof categorySchema>;

export enum courseStatus {
  planned = "planned",
  active = "active",
  ended = "ended",
  paused = "paused",
}

/** Where this class gets Zoom OAuth tokens for scheduling and attendance. */
export enum ZoomMeetingSource {
  school = "school",
  personal = "personal",
}


const courseSchema = z.object({
  id: z.number(),
  title: z.string().min(3),
  status: z.nativeEnum(courseStatus),
  code: z.string().nullable().optional().describe("Course ID"),
  user_courses: z.lazy(() => z.array(userCoursesSchema.partial())),
  category: z.number().or(z.object(categorySchema)),
  batch_number: z.string().optional().nullable().describe("Batch number"),
  description: z.string().min(3),
  start_date: z.coerce.date().describe("Start date"),
  end_date: z.coerce.date().describe("End date"),
  max_sessions: z.number().int().nullable().optional(),
  default_daily_note: z.any().optional().nullable(),
  join_code: z.string().nullable().optional(),
  is_join_code_enabled: z.boolean().default(true),
  join_code_expiry_date: z.string().nullable().optional(),

  repeat_every: z.array(z.string()).optional().nullable(),
  is_recurring: z.boolean().optional().nullable(),
  is_close_on_sabbath: z.boolean().optional().nullable(),
  student_count: z.coerce.number().optional().nullable(),
  main_teacher_count: z.coerce.number().optional().nullable(),
  assistant_teacher_count: z.coerce.number().optional().nullable(),
  meeting_link: z.string().optional().nullable().describe("Meeting Link"),
  meeting_scheduled_at: z
    .string()
    .optional()
    .nullable()
    .describe("When the meeting link was last set (audit, server-managed)"),
  meeting_join_id: z.string().optional().nullable().describe("MS Teams meeting join ID"),
  meeting_passcode: z.string().optional().nullable().describe("MS Teams meeting passcode"),
  microsoft_group_id: z.string().optional().nullable().describe("MS Teams group ID"),
  microsoft_channel_id: z.string().optional().nullable().describe("MS Teams channel ID"),
  microsoft_status: z.string().optional().describe("Computed MS status for chips"),
  zoom_meeting_id: z
    .string()
    .optional()
    .nullable()
    .describe(
      "Zoom meeting ID or instance UUID for attendance sync (Reports API /report/meetings/{id}/participants).",
    ),
  zoom_account_id: z
    .string()
    .optional()
    .nullable()
    .describe("Connected Zoom account for this course"),
  zoom_meeting_source: z
    .nativeEnum(ZoomMeetingSource)
    .optional()
    .describe("School Zoom (org OAuth) vs teacher personal Zoom"),
  zoom_personal_user: z
    .number()
    .optional()
    .nullable()
    .describe(
      "Schedjuice user id when using personal Zoom (bound teacher); read-only in API shapes.",
    ),
  zoom_meeting_uuid: z.string().optional().nullable(),
  zoom_meeting_host_id: z.string().optional().nullable(),
  has_teams_meeting_organizer: z
    .boolean()
    .optional()
    .describe("True if a teacher on the roster has Microsoft linked (Teams host)"),
  teams_meeting_organizer_unresolved: z
    .boolean()
    .optional()
    .describe(
      "True when a Teams meeting id exists but the host teacher cannot be determined for Microsoft",
    ),
  is_payment_enabled: z.boolean().describe("Enable Payment"),
  payment_plan: z.coerce.number().optional().nullable().describe("Payment Plan"),
  program: z
    .union([
      z.number(),
      z.object({
        id: z.number(),
        name: z.string(),
        course_creation_method: z.string().optional(),
        subject_strategy: z.string().optional(),
        is_session_credit_scheduling: z.boolean().optional(),
        default_max_sessions: z.number().optional(),
        is_substitution_reserve_enabled: z.boolean().optional(),
        default_substitution_reserve_days: z.number().optional(),
        allow_multiple_sessions_per_day: z.boolean().optional(),
      }),
    ])
    .optional()
    .describe("Program"),
  intake: z
    .union([
      z.number(),
      z.object({
        id: z.number(),
        name: z.string(),
        start_date: z.coerce.date().optional(),
        end_date: z.coerce.date().optional(),
      }),
    ])
    .optional()
    .nullable()
    .describe("Intake"),
  level: z
    .union([
      z.number(),
      z.object({ id: z.number(), name: z.string() }),
    ])
    .optional()
    .nullable()
    .describe("Program level"),
  section: z
    .union([
      z.number(),
      z.object({ id: z.number(), name: z.string() }),
    ])
    .optional()
    .nullable()
    .describe("Program level section"),
  course_subjects: z
    .array(
      z.object({
        id: z.number().optional(),
        subject: z.union([
          z.number(),
          z.object({ id: z.number(), name: z.string() }),
        ]),
        sort_order: z.number().optional(),
      }),
    )
    .optional(),
  subject: z
    .union([
      z.number(),
      z.object({
        id: z.number(),
        name: z.string(),
        description: z.string().optional().nullable(),
      }),
    ])
    .optional()
    .nullable()
    .describe("Subject"),
  exam_session_date: z
    .string()
    .optional()
    .nullable()
    .describe("Exam session month"),
  id_card_expiry_date: z
    .coerce.date()
    .nullable()
    .optional()
    .describe("ID card expiry date"),
  exam_board: z.enum(["EdExcel", "CIE"]).optional().nullable().describe("Exam board"),

  created_by: z
    .object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
    })
    .optional()
    .nullable(),
  primary_teacher: z
    .object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
    })
    .optional()
    .nullable()
    .describe("Main teacher on roster (same rule as Teams primary)"),
  first_event_time_from: z.string().optional().nullable(),
  first_event_time_to: z.string().optional().nullable(),
  nearest_event_time_from: z.string().optional().nullable(),
  nearest_event_time_to: z.string().optional().nullable(),
});

export enum completionType {
  completed = "completed",
  dropped = "dropped",
  failed = "failed",
}

export const courseHistorySchema = z.object({
  id: z.number(),

  course: courseSchema,
  user: accountSchema,
  created_by: accountSchema,
  completion_type: z.nativeEnum(completionType).optional().nullable(),
});

export const courseHistoryCreateSchema = z.object({
  course: z.number(),
  user: z.number(),
  completion_type: z.nativeEnum(completionType).describe("Completion Status"),
});

export const eventSchema = z.object({
  id: z.number() | z.string(),
  title: z.string(),
  date: z.date(),
  time_from: z.string(),
  time_to: z.string(),
  is_edit: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
  has_checkin: z.boolean().optional(),
  is_substitution_reserve: z.boolean().optional(),
  course: courseSchema,
});

export const eventCreateSchema = eventSchema.pick({
  title: true,
  date: true,
  time_from: true,
  time_to: true,
});

export type eventType = typeof eventSchema._type;

export const dailyNoteSchema = z.object({
  id: z.number(),
  note: z.any(),
  event: eventSchema,
});

export type courseType = z.infer<typeof courseSchema>;
const partiallyOmittedCourseObjectSchema = courseSchema.omit({
  id: true,
  user_courses: true,
  status: true,
  payment_plans: true,
  default_daily_note: true,
  repeat_every: true,
  is_recurring: true,
  is_close_on_sabbath: true,
  is_join_code_enabled: true,
  join_code: true,
  join_code_expiry_date: true,
  student_count: true,
  teacher_count: true,
  created_by: true,
  is_payment_enabled: true,
  meeting_link: true,
  meeting_scheduled_at: true,
  meeting_join_id: true,
  meeting_passcode: true,
  main_teacher_count: true,
  assistant_teacher_count: true,
  primary_teacher: true,
  first_event_time_from: true,
  first_event_time_to: true,
  nearest_event_time_from: true,
  nearest_event_time_to: true,
});

const partiallyOmittedCourseSchema = partiallyOmittedCourseObjectSchema.refine(
  (data) => {
    const s = new Date(data.start_date).getTime();
    const e = new Date(data.end_date).getTime();
    return e > s;
  },
  {
    message: "The end date must be after the start date.",
    path: ["end_date"],
  }
);
export const EXAM_BOARD_OPTIONS = ["EdExcel", "CIE"] as const;
export type ExamBoardType = (typeof EXAM_BOARD_OPTIONS)[number];

/** Backend / integration fields — not shown on course create or edit forms. */
export const COURSE_FORM_UI_EXCLUDED_KEYS: readonly string[] = [
  "zoom_meeting_id",
  "zoom_account_id",
  "zoom_meeting_source",
  "zoom_personal_user",
  "has_teams_meeting_organizer",
  "teams_meeting_organizer_unresolved",
  "max_sessions",
];

/** Default course form/table field keys. MS Teams ID/passcode supplied by backend. */
export const DEFAULT_COURSE_FIELDS = [
  "title",
  "code",
  "category",
  "batch_number",
  "description",
  "start_date",
  "end_date",
  "payment_plan",
] as const;

/** Program-scoped fields always shown on create/edit regardless of default field list. */
export const COURSE_PROGRAM_SCOPED_FIELD_KEYS = [
  "program",
  "intake",
  "subject",
  "level",
  "section",
] as const;

export type CourseProgramScopedFieldKey =
  (typeof COURSE_PROGRAM_SCOPED_FIELD_KEYS)[number];

const COURSE_PROGRAM_SCOPED_FIELD_SET: ReadonlySet<string> = new Set(
  COURSE_PROGRAM_SCOPED_FIELD_KEYS,
);

export function isCourseProgramScopedFieldKey(
  key: string,
): key is CourseProgramScopedFieldKey {
  return COURSE_PROGRAM_SCOPED_FIELD_SET.has(key);
}

/** Known Course field names for forms/tables. */
export const VALID_COURSE_FIELD_NAMES = [
  ...DEFAULT_COURSE_FIELDS,
  "subject",
  "exam_session_date",
  "id_card_expiry_date",
  "exam_board",
  "program",
  "intake",
  "level",
  "section",
  "zoom_meeting_id",
  "zoom_account_id",
  "course_type",
] as const;

const COURSE_FIELD_ALIAS_TO_CANONICAL: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const name of VALID_COURSE_FIELD_NAMES) {
    m.set(name.toLowerCase(), name);
    m.set(name.replace(/_/g, " ").toLowerCase(), name);
  }
  m.set("course id", "code");
  m.set("internal course code", "code");
  m.set("batch number", "batch_number");
  m.set("class group", "batch_number");
  m.set("start date", "start_date");
  m.set("end date", "end_date");
  m.set("payment plan", "payment_plan");
  m.set("exam intake", "exam_session_date");
  m.set("exam session date", "exam_session_date");
  m.set("exam board", "exam_board");
  return m;
})();

export function normalizeCourseFieldKeyForForm(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }
  return COURSE_FIELD_ALIAS_TO_CANONICAL.get(trimmed.toLowerCase()) ?? trimmed;
}

export { partiallyOmittedCourseSchema };

export {
  courseSchema,
  userCoursesSchema,
  categorySchema,
  categoryCreateUpdateSchema,
  assignedAsRoleSchema,
  assignedAsRoleCreateSchema,
};
export type assignedAsRoleType = z.infer<typeof assignedAsRoleSchema>;
// class includes students, teachers, etc.
// course includes classes
// classe are just a collection of students and teachers
// how about exams? will the course have the schedule or the class? The class can have schedule, but, tied to course?
// course will just have lesson outlines
// class will have schedule
// classes can have courses within a certain timeframe
// go fuck yourself ^

export enum courseJoinRequestStatus {
  pending = "pending",
  approved = "approved",
  rejected = "rejected",
}
export type courseJoinRequestType = {
  id: number;
  course: number;
  user: number;
  status: courseJoinRequestStatus;
  created_at: string;
  updated_at: string;
};

/** Response payload from GET /courses/join/{code} (nested under envelope data). */
export type joinCourseLookupResponse = {
  id: number;
  title: string;
  has_user: boolean;
  is_join_code_enabled: boolean;
  is_join_code_expired?: boolean;
  is_join_code_disabled?: boolean;
  is_already_joined?: boolean;
  previous_join_request?: courseJoinRequestType;
};

export type CourseSuggestResult = {
  id: number;
  title: string;
  code: string | null;
  status: string;
  program_name?: string | null;
  subject_name?: string | null;
};
