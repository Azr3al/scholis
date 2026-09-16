import * as z from "zod";
import { postTypeSchema } from "@/types/course-feed";

export const announcementSchema = z.object({
  id: z.number(),
  post_type: postTypeSchema.default("announcement"),
  title: z.string().nullable().optional(),
  finished_unit: z.number().int().positive().nullable().optional(),
  data: z.any().describe("Content"),
  html_data: z.string().nullable().optional(),
  is_pinned: z.boolean().default(false),
  created_at: z.date(),
  updated_at: z.date(),
  course: z.number().optional(),
  created_by: z.number().optional(),
});

export const announcementCreateSchema = announcementSchema.omit({
  id: true,
  created_at: true,
  is_pinned: true,
  updated_at: true,
  course: true,
  created_by: true,
});

export const announcementUpdateSchema = announcementSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  course: true,
  created_by: true,
});

export type announcemenUpdatetType = z.infer<typeof announcementUpdateSchema>;
export type announcementType = z.infer<typeof announcementSchema>;
