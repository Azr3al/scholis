import * as z from "zod";
import { EXAM_BOARD_OPTIONS } from "@/types/course";

export const subjectSchema = z.object({
  id: z.number(),
  name: z.string().min(1).describe("Name"),
  description: z.string().optional().nullable().describe("Description"),
  exam_board: z
    .enum(EXAM_BOARD_OPTIONS)
    .optional()
    .nullable()
    .describe("Exam board"),
});

export const subjectCreateUpdateSchema = subjectSchema.omit({ id: true });

export type subjectType = z.infer<typeof subjectSchema>;
export type subjectCreateUpdateType = z.infer<typeof subjectCreateUpdateSchema>;

/** @deprecated Use subjectType instead */
export interface ISubject {
  id: number;
  name: string;
  description?: string | null;
  exam_board?: (typeof EXAM_BOARD_OPTIONS)[number] | null;
}
