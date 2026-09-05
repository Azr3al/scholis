import { publicApiFetch } from "@/lib/public-api-fetch";
import { axiosClient } from "@/lib/api";
import { z } from "zod";
import {
  consultationAvailabilitySlotSchema,
  consultationBookingLinkSchema,
  consultationBookingSchema,
  consultationPublicBookingByTokenSchema,
  consultationPublicBookingOptionsSchema,
  consultationPublicBookingResultSchema,
  consultationPublicCancelResultSchema,
  consultationPublicConfigSchema,
  consultationWhitelistSchema,
  type ConsultationAvailabilitySlot,
  type ConsultationBooking,
  type ConsultationBookingLink,
  type ConsultationPublicBookingByToken,
  type ConsultationPublicBookingOptions,
  type ConsultationPublicBookingResult,
  type ConsultationPublicCancelResult,
  type ConsultationPublicConfig,
  type ConsultationWhitelist,
} from "@/types/consultation";
import type { LwtpBookingDetailsPayload } from "@/lib/consultation/lwtp-booking-fields";

function unwrapData<T>(res: { data?: { isError?: boolean; message?: string; data?: T } }): T {
  const { isError, message, data } = res.data ?? {};
  if (isError || data == null) {
    throw new Error(message ?? "Request failed");
  }
  return data;
}

export async function fetchConsultationBookingLink(): Promise<ConsultationBookingLink> {
  const res = await axiosClient.get("consultation/me/booking-link");
  return consultationBookingLinkSchema.parse(unwrapData(res));
}

export async function rotateConsultationBookingLink(): Promise<ConsultationBookingLink> {
  const res = await axiosClient.post("consultation/me/booking-link/rotate", {});
  return consultationBookingLinkSchema.parse(unwrapData(res));
}

export async function fetchConsultationWhitelist(): Promise<ConsultationWhitelist> {
  const res = await axiosClient.get("consultation/me/whitelist");
  return consultationWhitelistSchema.parse(unwrapData(res));
}

export async function patchConsultationWhitelist(
  schedule: ConsultationWhitelist["schedule"],
): Promise<ConsultationWhitelist> {
  const res = await axiosClient.patch("consultation/me/whitelist", { schedule });
  return consultationWhitelistSchema.parse(unwrapData(res));
}

export async function applyConsultationLwtpPreset(): Promise<ConsultationWhitelist> {
  const res = await axiosClient.post("consultation/me/whitelist/apply-preset", {});
  return consultationWhitelistSchema.parse(unwrapData(res));
}

export async function fetchConsultationBookings(
  status: "all" | "confirmed" | "cancelled" | "pending" = "all",
): Promise<ConsultationBooking[]> {
  const res = await axiosClient.get("consultation/me/bookings", {
    params: { status },
  });
  const data = unwrapData<unknown[]>(res);
  return z.array(consultationBookingSchema).parse(data);
}

export async function cancelConsultationBooking(
  bookingId: number,
): Promise<ConsultationBooking> {
  const res = await axiosClient.post(`consultation/bookings/${bookingId}/cancel`, {});
  return consultationBookingSchema.parse(unwrapData(res));
}

export async function approveConsultationBooking(
  bookingId: number,
): Promise<ConsultationBooking> {
  const res = await axiosClient.post(`consultation/bookings/${bookingId}/approve`, {});
  return consultationBookingSchema.parse(unwrapData(res));
}

export async function issueConsultationBookingManageLink(
  bookingId: number,
): Promise<{ booking_url: string }> {
  const res = await axiosClient.post(
    `consultation/bookings/${bookingId}/manage-link`,
    {},
  );
  const data = unwrapData<{ booking_url?: string }>(res);
  return { booking_url: z.string().parse(data.booking_url ?? "") };
}

export async function fetchConsultationPublicBookingByToken(
  token: string,
): Promise<ConsultationPublicBookingByToken> {
  const data = await publicApiFetch<unknown>(
    `consultation/public/bookings/by-token?token=${encodeURIComponent(token)}`,
  );
  return consultationPublicBookingByTokenSchema.parse(data);
}

export async function fetchConsultationPublicConfig(
  slug: string,
): Promise<ConsultationPublicConfig> {
  const data = await publicApiFetch<unknown>(`consultation/public/${slug}/config`);
  return consultationPublicConfigSchema.parse(data);
}

export async function fetchConsultationPublicBookingOptions(
  slug: string,
): Promise<ConsultationPublicBookingOptions> {
  const data = await publicApiFetch<unknown>(
    `consultation/public/${slug}/booking-options`,
  );
  return consultationPublicBookingOptionsSchema.parse(data);
}

export async function fetchConsultationAvailabilityDates(
  slug: string,
  month: string,
): Promise<string[]> {
  const data = await publicApiFetch<{ dates?: string[] }>(
    `consultation/public/${slug}/availability/dates?month=${encodeURIComponent(month)}`,
  );
  return z.array(z.string()).parse(data.dates ?? []);
}

export async function fetchConsultationAvailabilitySlots(
  slug: string,
  date: string,
): Promise<ConsultationAvailabilitySlot[]> {
  const data = await publicApiFetch<{ slots?: unknown[] }>(
    `consultation/public/${slug}/availability?date=${encodeURIComponent(date)}`,
  );
  return z.array(consultationAvailabilitySlotSchema).parse(data.slots ?? []);
}

export type CreateConsultationPublicBookingInput = {
  scheduled_at: string;
  student_name: string;
  student_email: string;
  details?: LwtpBookingDetailsPayload;
};

export async function createConsultationPublicBooking(
  slug: string,
  payload: CreateConsultationPublicBookingInput,
): Promise<ConsultationPublicBookingResult> {
  const data = await publicApiFetch<unknown>(
    `consultation/public/${slug}/bookings`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return consultationPublicBookingResultSchema.parse(data);
}

export async function cancelConsultationPublicBooking(
  cancelToken: string,
): Promise<ConsultationPublicCancelResult> {
  const data = await publicApiFetch<unknown>("consultation/public/cancel", {
    method: "POST",
    body: JSON.stringify({ cancel_token: cancelToken }),
  });
  return consultationPublicCancelResultSchema.parse(data);
}

export async function unlinkGoogleCalendar(): Promise<void> {
  await axiosClient.post("google/calendar/unlink", {});
}

export async function fetchGoogleCalendarLinkAuthorizeUrl(
  returnPath: string,
): Promise<string> {
  const response = await axiosClient.get<{ authorize_url?: string }>(
    "google/oauth/start/calendar-link",
    {
      params: {
        return_origin: window.location.origin,
        return_path: returnPath,
      },
    },
  );
  const authorizeUrl = response.data?.authorize_url;
  if (!authorizeUrl) {
    throw new Error("No authorize URL returned.");
  }
  return authorizeUrl;
}
