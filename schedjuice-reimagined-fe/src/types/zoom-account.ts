import * as z from "zod";

export enum ZoomAccountStatus {
  active = "active",
  needs_reconnect = "needs_reconnect",
  disconnected = "disconnected",
}

export const zoomAccountSchema = z.object({
  id: z.number(),
  account_id: z.string(),
  account_name: z.string(),
  authorized_by_email: z.string(),
  status: z.nativeEnum(ZoomAccountStatus),
  default_host_zoom_user_id: z.string(),
  default_host_email: z.string(),
  default_host_name: z.string(),
  last_validated_at: z.string().nullable().optional(),
  last_error: z.string(),
  has_default_host: z.boolean(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type zoomAccountType = z.infer<typeof zoomAccountSchema>;

export type ZoomAccountUserRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
};
