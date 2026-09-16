import * as z from "zod";
import { accountSchema } from "./user";

export const departmentSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
});

export type DepartmentType = z.infer<typeof departmentSchema>;

export const departmentCreateSchema = departmentSchema.omit({ id: true });

export const jobSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  department: z.number(),
});

export type JobType = z.infer<typeof jobSchema>;

export const jobCreateSchema = jobSchema.omit({ id: true });

export const userDepartmentSchema = z.object({
  id: z.number(),
  user: accountSchema.or(z.number()),
  department: departmentSchema.or(z.number()),
  job: jobSchema.or(z.number()),
  is_leader: z.boolean().default(false),
});
