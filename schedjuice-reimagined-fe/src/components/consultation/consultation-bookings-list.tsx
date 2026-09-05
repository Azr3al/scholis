"use client";

import {
  approveConsultationBooking,
  cancelConsultationBooking,
  fetchConsultationBookings,
} from "@/app/client-api/consultation";
import { ConsultationBookingsCalendar } from "@/components/consultation/consultation-bookings-calendar";
import { ConsultationBookingSheet } from "@/components/consultation/consultation-booking-sheet";
import { useToast } from "@/components/primitives";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import type { organizationType } from "@/types/organization";
import { ConsultationBookingStatus } from "@/types/consultation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

export const consultationBookingsQueryKey = ["consultation", "bookings"] as const;

export function ConsultationBookingsList({
  tenant,
  canManage,
}: {
  tenant: organizationType | null;
  canManage: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const timezone = tenant?.timezone;
  const [selectedBookingId, setSelectedBookingId] = useState<number | undefined>(
    undefined,
  );

  const bookingsQuery = useQuery({
    queryKey: consultationBookingsQueryKey,
    queryFn: () => fetchConsultationBookings("all"),
  });

  const approveMutation = useMutation({
    mutationFn: approveConsultationBooking,
    onSuccess: () => {
      toast.add({ title: "Booking approved" });
      void queryClient.invalidateQueries({
        queryKey: consultationBookingsQueryKey,
      });
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not approve booking",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelConsultationBooking,
    onSuccess: (_data, bookingId) => {
      const booking = bookingsQuery.data?.find((row) => row.id === bookingId);
      const wasPending = booking?.status === ConsultationBookingStatus.Pending;
      toast.add({ title: wasPending ? "Request declined" : "Booking cancelled" });
      void queryClient.invalidateQueries({
        queryKey: consultationBookingsQueryKey,
      });
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not update booking",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const bookings = bookingsQuery.data ?? [];

  const selectedBooking = useMemo(
    () => bookings.find((row) => row.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId],
  );

  const actionsDisabled = approveMutation.isPending || cancelMutation.isPending;

  return (
    <>
      <ConsultationBookingsCalendar
        bookings={bookings}
        timezone={timezone}
        isLoading={bookingsQuery.isLoading}
        onBookingClick={setSelectedBookingId}
      />

      <ConsultationBookingSheet
        open={selectedBooking != null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedBookingId(undefined);
          }
        }}
        booking={selectedBooking}
        tenant={tenant}
        canManage={canManage}
        actionsDisabled={actionsDisabled}
        approvingBookingId={
          approveMutation.isPending ? (approveMutation.variables ?? null) : null
        }
        decliningBookingId={
          cancelMutation.isPending ? (cancelMutation.variables ?? null) : null
        }
        onApprove={(bookingId) => approveMutation.mutate(bookingId)}
        onCancel={(bookingId) => cancelMutation.mutate(bookingId)}
      />
    </>
  );
}
