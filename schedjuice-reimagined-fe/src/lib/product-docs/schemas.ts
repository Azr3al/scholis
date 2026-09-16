import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const platformDocsArticleSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(512),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(256)
    .regex(slugRegex, "Use lowercase letters, numbers, and hyphens only"),
  category: z
    .number({ invalid_type_error: "Select a category" })
    .int()
    .positive("Select a category"),
  audiences: z
    .array(z.enum(["all", "admin", "teacher", "student"]))
    .min(1, "Select at least one audience"),
  markdown_body: z.string().optional().default(""),
});

export const platformDocsCategorySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(256),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(128)
    .regex(slugRegex, "Use lowercase letters, numbers, and hyphens only"),
  sort_order: z.coerce.number().int().min(0).default(0),
  default_audience: z.enum(["all", "admin", "teacher", "student"]).default("all"),
});

export type PlatformDocsArticleValues = z.infer<typeof platformDocsArticleSchema>;
export type PlatformDocsCategoryValues = z.infer<typeof platformDocsCategorySchema>;
