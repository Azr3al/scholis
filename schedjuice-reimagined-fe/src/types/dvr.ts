import * as z from "zod";

export enum DataVerificationRequestStatus {
  PENDING = "pending",
  AWAITING_VERIFICATION = "awaiting_verification",
  VERIFIED = "verified",
  REJECTED = "rejected",
}

export const dvrFieldConfigSchema = z.object({
  name: z.string(),
  required: z.boolean(),
});

export const dataVerificationRequestSchema = z.object({
  id: z.number(),
  name: z.string(),
  fields: z.array(z.union([z.string(), dvrFieldConfigSchema])).optional(),
  requested_user_types: z.any(),
  expires_on: z.string().optional().nullable(),
  created_by: z.any().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const dvrCreateSchema = dataVerificationRequestSchema.pick({
  name: true,
  fields: true,
  requested_user_types: true,
  expires_on: true,
});
