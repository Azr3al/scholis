"use client";

import { cancelConsultationPublicBooking } from "@/app/client-api/consultation";
import { AlertDialog, Button, buttonVariants } from "@/components/primitives";
import { formatDateTime } from "@/helpers/date";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import {
  ConsultationBookingStatus,
  type ConsultationPublicBookingResult,
} from "@/types/consultation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

type BookingConfirmStepProps = {
  booking: ConsultationPublicBookingResult;
  consultantName: string;
  onCancelled?: () => void;
};

function extractBookingToken(bookingUrl: string): string | null {
  try {
    const url = new URL(bookingUrl, "https://placeholder.local");
    return url.searchParams.get("token");
  } catch {
    return null;
  }
}

export function BookingConfirmStep({
  booking,
  consultantName,
  onCancelled,
}: BookingConfirmStepProps) {
  const scheduledLabel = formatDateTime(booking.scheduled_at);
  const isPending = booking.status === ConsultationBookingStatus.Pending;
  const isConfirmed = booking.status === ConsultationBookingStatus.Confirmed;
  const cancelToken = useMemo(
    () => extractBookingToken(booking.booking_url),
    [booking.booking_url],
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!cancelToken) {
        throw new Error("Missing booking token.");
      }
      return cancelConsultationPublicBooking(cancelToken);
    },
    onSuccess: () => {
      setConfirmOpen(false);
      onCancelled?.();
    },
  });

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-serif text-xl text-text-primary">
          {isPending ? "Request sent" : "You&apos;re booked"}
        </h2>
        <p className="text-sm text-text-secondary">
          {isPending
            ? `Your consultation with ${consultantName} on ${scheduledLabel} is waiting for confirmation.`
            : `Consultation with ${consultantName} on ${scheduledLabel}.`}
        </p>
        {isPending ? (
          <p className="text-sm text-text-secondary">
            Check your email for updates. You can view or cancel this request below.
          </p>
        ) : null}
      </div>

      {isConfirmed && booking.meeting_link ? (
        <div className="rounded-md border border-border bg-surface-elevated p-4">
          <p className="text-sm font-medium text-text-primary">Google Meet</p>
          <Link
            href={booking.meeting_link}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "primary", size: "sm" }),
              "mt-2 w-full sm:w-auto",
            )}
          >
            Join meeting
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={booking.booking_url}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full sm:w-auto")}
        >
          View booking
        </Link>
        {cancelToken ? (
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={cancelMutation.isPending}
            isLoading={cancelMutation.isPending}
          >
            Cancel booking
          </Button>
        ) : null}
      </div>

      {cancelMutation.isError ? (
        <p className="text-sm text-danger" role="alert">
          {parseSchedjuiceApiError(cancelMutation.error, "Could not cancel this booking.")}
        </p>
      ) : null}

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup className="w-full max-w-sm">
            <AlertDialog.Title>Cancel this consultation?</AlertDialog.Title>
            <AlertDialog.Description>
              This frees the time slot. You can book again from the consultant&apos;s
              link if needed.
            </AlertDialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <AlertDialog.Close render={<Button variant="ghost">Keep booking</Button>} />
              <Button
                variant="danger"
                isLoading={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                Yes, cancel
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
