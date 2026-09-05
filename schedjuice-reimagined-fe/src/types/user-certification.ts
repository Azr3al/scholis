import { z } from "zod";

export const userCertificationSchema = z.object({
  id: z.number(),
  title: z.string(),
  issuing_organization: z.string(),
  issued_on: z.string(),
  expires_on: z.string().nullable(),
  sort_order: z.number(),
  attachment_id: z.number().nullable().optional(),
  attachment_filename: z.string().nullable().optional(),
  attachment_url: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export type UserCertification = z.infer<typeof userCertificationSchema>;

export const userCertificationInputSchema = z.object({
  title: z.string().min(1, "Title is required"),
  issuing_organization: z.string().min(1, "Issuing organization is required"),
  issued_on: z.string().min(1, "Issue date is required"),
  expires_on: z.string().nullable().optional(),
  attachment_id: z.number().nullable().optional(),
});

export type UserCertificationInput = z.infer<typeof userCertificationInputSchema>;

export const publicCertificationSchema = z.object({
  title: z.string(),
  issuing_organization: z.string(),
  issued_on: z.string(),
  expires_on: z.string().nullable(),
  file_url: z.string().nullable().optional(),
  file_filename: z.string().nullable().optional(),
});

export type PublicCertification = z.infer<typeof publicCertificationSchema>;

export const publicProfileSchema = z.object({
  name: z.string(),
  role_label: z.string(),
  profile_image_url: z.string().nullable(),
  qualifications: z.record(z.unknown()).nullable(),
  certifications: z.array(publicCertificationSchema).optional(),
});

export type PublicProfile = z.infer<typeof publicProfileSchema>;

export interface PublicTenantBranding {
  name?: string;
  logo?: string | null;
  default_cover_image?: string | null;
  tagline?: string;
}

export type PublicProfileStatus = "loading" | "ready" | "not_found" | "error";
