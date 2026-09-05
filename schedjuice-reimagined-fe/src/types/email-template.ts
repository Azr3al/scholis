import * as z from "zod";

export const emailTemplateSchema = z.object({
  id: z.number(),
  name: z.string(),
  subject: z.string(),
  body: z.any(),
  created_by: z.number(),
  course: z.number().optional().nullable(),
  valid_variables: z.any()
});

export const emailTemplateCreateSchema = emailTemplateSchema.pick({
  name: true,
  subject: true,

});
