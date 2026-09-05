import { z } from "zod";

export const subjectUsageProgramSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const subjectUsageRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  count: z.number(),
  programs: z.array(subjectUsageProgramSchema).default([]),
});

export const subjectUsageResponseSchema = z.object({
  subjects: z.array(subjectUsageRowSchema),
});

export type SubjectUsageProgram = z.infer<typeof subjectUsageProgramSchema>;
export type SubjectUsageRow = z.infer<typeof subjectUsageRowSchema>;
export type SubjectUsageResponse = z.infer<typeof subjectUsageResponseSchema>;
