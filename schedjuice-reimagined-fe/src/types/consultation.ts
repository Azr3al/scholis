import { z } from "zod";

export enum ConsultationClassPreference {
  PremiumOneOnOne = "premium_one_on_one",
  GroupClass = "group_class",
  BothOk = "both_ok",
}

export enum ConsultationReadinessKey {
  GoogleIdentity = "google_identity",
  GoogleCalendar = "google_calendar",
  Whitelist = "whitelist",
  OrgDisabled = "org_booking_disabled",
}

export enum ConsultationBookingStatus {
  Pending = "pending",
  Confirmed = "confirmed",
  Cancelled = "cancelled",
}

export enum ConsultationCancelledBy {
  Consultant = "consultant",
  Student = "student",
}

export const CONSULTATION_WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type ConsultationWeekdayKey = (typeof CONSULTATION_WEEKDAY_KEYS)[number];

const timeWindowSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const dayScheduleSchema = z.object({
  enabled: z.boolean(),
  windows: z.array(timeWindowSchema),
});

export const consultationReadinessSchema = z.object({
  google_identity_linked: z.boolean(),
  google_calendar_connected: z.boolean(),
  is_bookable: z.boolean(),
  missing: z.array(z.nativeEnum(ConsultationReadinessKey)),
});

export const consultationGoogleCalendarSchema = z.object({
  connected: z.boolean(),
  authorized_email: z.string(),
  authorized_display_name: z.string(),
});

export const consultationBookingLinkSchema = z.object({
  url: z.string(),
  slug: z.string(),
  readiness: consultationReadinessSchema,
  google_calendar: consultationGoogleCalendarSchema,
});

export const consultationWhitelistSchema = z.object({
  schedule: z.record(dayScheduleSchema),
  slot_duration_minutes: z.number(),
});

export const consultationBookingSchema = z.object({
  id: z.number(),
  scheduled_at: z.string(),
  duration_minutes: z.number(),
  student_name: z.string(),
  student_email: z.string(),
  meeting_link: z.string(),
  status: z.nativeEnum(ConsultationBookingStatus),
  cancelled_at: z.string().nullable(),
  cancelled_by: z.nativeEnum(ConsultationCancelledBy).nullable(),
  created_at: z.string(),
  details: z.record(z.unknown()).optional().default({}),
  booking_url: z.string().optional().default(""),
});

export const consultationPublicConfigSchema = z.object({
  name: z.string(),
  timezone: z.string(),
  slot_duration_minutes: z.number(),
  consultation_strategy: z.string(),
});

const consultationBookingSubjectOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const consultationPublicBookingOptionsSchema = z.object({
  consultation_strategy: z.string(),
  exam_boards: z.array(z.string()),
  subjects_by_board: z.record(z.array(consultationBookingSubjectOptionSchema)),
});

export const consultationAvailabilitySlotSchema = z.object({
  slot_time: z.string(),
  scheduled_at: z.string(),
});

export const consultationPublicBookingResultSchema = z.object({
  id: z.number(),
  status: z.nativeEnum(ConsultationBookingStatus),
  meeting_link: z.string().optional().default(""),
  booking_url: z.string(),
  scheduled_at: z.string(),
});

export const consultationPublicBookingByTokenSchema = z.object({
  status: z.nativeEnum(ConsultationBookingStatus),
  scheduled_at: z.string(),
  meeting_link: z.string().optional().default(""),
  consultant_name: z.string(),
  student_name: z.string(),
  student_email: z.string(),
  details: z.record(z.unknown()).optional().default({}),
  can_cancel: z.boolean(),
});

export const consultationPublicCancelResultSchema = z.object({
  id: z.number(),
  status: z.nativeEnum(ConsultationBookingStatus),
  cancelled_at: z.string().nullable(),
});

export type ConsultationReadiness = z.infer<typeof consultationReadinessSchema>;
export type ConsultationGoogleCalendar = z.infer<typeof consultationGoogleCalendarSchema>;
export type ConsultationBookingLink = z.infer<typeof consultationBookingLinkSchema>;
export type ConsultationWhitelist = z.infer<typeof consultationWhitelistSchema>;
export type ConsultationBooking = z.infer<typeof consultationBookingSchema>;
export type ConsultationDaySchedule = z.infer<typeof dayScheduleSchema>;
export type ConsultationTimeWindow = z.infer<typeof timeWindowSchema>;
export type ConsultationPublicConfig = z.infer<typeof consultationPublicConfigSchema>;
export type ConsultationPublicBookingOptions = z.infer<
  typeof consultationPublicBookingOptionsSchema
>;
export type ConsultationBookingSubjectOption = z.infer<
  typeof consultationBookingSubjectOptionSchema
>;
export type ConsultationAvailabilitySlot = z.infer<typeof consultationAvailabilitySlotSchema>;
export type ConsultationPublicBookingResult = z.infer<
  typeof consultationPublicBookingResultSchema
>;
export type ConsultationPublicBookingByToken = z.infer<
  typeof consultationPublicBookingByTokenSchema
>;
export type ConsultationPublicCancelResult = z.infer<
  typeof consultationPublicCancelResultSchema
>;
