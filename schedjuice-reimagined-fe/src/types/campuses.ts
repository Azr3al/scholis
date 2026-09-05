import * as z from "zod";

export const CampusCreateEditSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  location: z.string().optional().nullable(),
  is_online: z.boolean().default(false),
  is_default: z.boolean().default(false),
  latitude: z.coerce.number().nullable().optional().describe("Latitude"),
  longitude: z.coerce.number().nullable().optional().describe("Longitude"),
  geofence_radius_meters: z.coerce
    .number()
    .int()
    .positive()
    .default(100)
    .describe("Geofence radius (meters)"),
});

export type CampusType = z.infer<typeof CampusCreateEditSchema>;
