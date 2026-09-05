import * as z from "zod";
import { programSchema } from "./program";

export const intakeSchema = z.object({
  id: z.number(),
  name: z.string().describe("Intake name"),
  program: z.union([z.number(), programSchema]).describe("Program"),
  start_date: z.coerce.date().describe("Start date"),
  end_date: z.coerce.date().describe("End date"),
  description: z.string().optional().describe("Description"),
  courses_count: z.number().optional(),
  generation_defaults: z.record(z.unknown()).optional(),
});

export const intakeCreateSchema = intakeSchema.omit({
  id: true,
  courses_count: true,
});

export const intakeEditFieldsSchema = intakeSchema.omit({
  id: true,
  program: true,
  courses_count: true,
  generation_defaults: true,
});

export const intakeEditSchema = intakeEditFieldsSchema.refine(
  (data) => data.end_date > data.start_date,
  {
    message: "End date must be after start date.",
    path: ["end_date"],
  },
);

export type intakeType = z.infer<typeof intakeSchema>;
export type intakeEditFormValues = z.infer<typeof intakeEditSchema>;

export function intakeToFormValues(intake: intakeType): intakeEditFormValues {
  return {
    name: intake.name,
    start_date: new Date(intake.start_date),
    end_date: new Date(intake.end_date),
    description: intake.description ?? "",
  };
}

export type RecurringSlot = {
  weekday: string;
  time_from: string;
  time_to: string;
};

export type LevelSectionSelection = {
  name: string;
  sectionId?: number;
};

export type IntakePreviewCourseRow = {
  key: string;
  included?: boolean;
  title: string;
  subject_id?: number;
  subject_name?: string;
  program_subject_id?: number;
  level_id?: number;
  section_id?: number | null;
  start_date?: string;
  end_date?: string;
  is_extra?: boolean;
};

export type ExtraIntakeCourseDraft = {
  key: string;
  subject_id: number;
  title?: string;
};

export type IntakeGenerationDefaults = {
  category_id?: number;
  payment_plan_id?: number;
  start_date?: string;
  end_date?: string;
  description?: string;
  course_type?: string;
  campus_id?: number;
  is_payment_enabled?: boolean;
  exam_session_date?: string;
  exam_board?: "EdExcel" | "CIE";
};

export type IntakePreviewResponse = {
  intake_id: number;
  courses: IntakePreviewCourseRow[];
  count: number;
};
