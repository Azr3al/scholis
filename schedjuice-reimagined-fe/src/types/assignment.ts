import * as z from "zod";

export enum assignmentStatus {
  available_to_submit = "Available To Submit",
  ready_to_be_graded = "Ready To Be Graded",
  require_resubmission = "Require Resubmission",
  submitted = "Submitted",
  overdue = "Overdue",
  locked = "Locked",
  graded = "Graded",
}

export const submissionSchema = z.object({
  id: z.number(),
  description: z.any().optional().nullable(),
  feedback: z.string().optional().nullable(),
  attempt_count: z.coerce.number().describe("Attempt count"),
  is_submitted: z.boolean().default(false).describe("Submission status"),
  user_score: z.coerce.number().optional().nullable().describe("User score"),
  is_graded: z.boolean().default(false).describe("Graded status"),
  are_results_released: z.boolean().default(false).describe("Results released"),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  assignment: z.union([z.number(), z.any()]).optional().nullable(),
  created_by: z.any().optional().nullable(),
  attachments: z.array(z.any()).optional().nullable(),
});

export const submissionCreateSchema = submissionSchema.omit({
  id: true,
  is_graded: true,
  are_results_released: true,
  user_score: true,
  feedback: true,
  attempt_count: true,
  created_at: true,
  updated_at: true,
  created_by: true,
  attachments: true,
});

export type submissionCreateType = z.infer<typeof submissionCreateSchema>;
export type submissionType = z.infer<typeof submissionSchema>;

export const assignmentSchema = z.object({
  id: z.number(),
  title: z.string().min(1, "Title is required").describe("Assignment Title"),
  course: z.coerce.number().describe("Course ID"),
  available_datetime: z.coerce.date().describe("Available date"),
  due_datetime: z.coerce.date().describe("Due date"),
  available_score: z.coerce.number().positive().describe("Maximum points"),
  max_attempts: z.coerce.number().positive().default(10).describe("Maximum attempts"),
  results_release_date: z.coerce.date().optional().nullable(),
  instructions: z.any().optional().nullable().describe("Instructions"),
  submissions: z.array(z.any()).optional().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const assignmentCreateSchema = assignmentSchema.omit({
  id: true,
  submissions: true,
  created_at: true,
  updated_at: true,
  course:true
});

export const assignmentUpdateSchema = assignmentSchema.omit({
  id: true,
  course: true,
  created_at: true,
  updated_at: true,
  submissions: true,
});

export const submissionGradingSchema = z.object({
  user_score: z.coerce.number().min(0, "Score must be positive"),
  feedback: z.string().optional(),
  is_graded: z.boolean().default(true),
});

export type assignmentUpdateType = z.infer<typeof assignmentUpdateSchema>;
export type assignmentCreateType = z.infer<typeof assignmentCreateSchema>;
export type assignmentType = z.infer<typeof assignmentSchema>;
export type submissionGradingType = z.infer<typeof submissionGradingSchema>;
