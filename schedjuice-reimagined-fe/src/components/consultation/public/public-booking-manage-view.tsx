"use client";

import {
  cancelConsultationPublicBooking,
  fetchConsultationPublicBookingByToken,
} from "@/app/client-api/consultation";
import { Loader } from "@/components/form/loader";
import { PageContainer } from "@/components/layout/page-container";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/public/elevated-card";
import { AlertDialog, Button, buttonVariants } from "@/components/primitives";
import { formatDateTime } from "@/helpers/date";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { formatLwtpBookingDetailRows } from "@/lib/consultation/lwtp-booking-fields";
import {
  globalRoutePageWidth,
  resolveGlobalRouteLayout,
} from "@/lib/ui-remediation/r6-global-route-classes";
import { ConsultationBookingStatus } from "@/types/consultation";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

const PAGE_WIDTH = globalRoutePageWidth(
  resolveGlobalRouteLayout("/(public)/book-consultation/booking"),
);

export function consultationPublicBookingByTokenKey(token: string) {
  return ["consultation", "public", "booking", token] as const;
}

export function PublicBookingManageView() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const bookingQuery = useQuery({
    queryKey: consultationPublicBookingByTokenKey(token),
    queryFn: () => fetchConsultationPublicBookingByToken(token),
    enabled: Boolean(token),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelConsultationPublicBooking(token),
    onSuccess: () => {
      setConfirmOpen(false);
      void queryClient.invalidateQueries({
        queryKey: consultationPublicBookingByTokenKey(token),
      });
    },
  });

  if (!token) {
    return (
      <PageContainer width={PAGE_WIDTH} className="py-10 max-sm:py-5">
        <Card>
          <CardHeader>
            <CardTitle>Your consultation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-secondary">
              This booking link is missing or invalid.
            </p>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  if (bookingQuery.isLoading) {
    return (
      <PageContainer width={PAGE_WIDTH} className="py-10 max-sm:py-5">
        <Card>
          <CardHeader>
            <CardTitle>Your consultation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2" aria-busy="true">
              <Loader />
              <p className="text-sm text-text-secondary">Loading booking…</p>
            </div>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  if (bookingQuery.isError || !bookingQuery.data) {
    return (
      <PageContainer width={PAGE_WIDTH} className="py-10 max-sm:py-5">
        <Card>
          <CardHeader>
            <CardTitle>Your consultation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-text-secondary">
              {parseSchedjuiceApiError(
                bookingQuery.error,
                "This booking could not be found.",
              )}
            </p>
            <Button variant="secondary" onClick={() => bookingQuery.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const booking = bookingQuery.data;
  const when = formatDateTime(booking.scheduled_at);
  const isCancelled = booking.status === ConsultationBookingStatus.Cancelled;
  const isPending = booking.status === ConsultationBookingStatus.Pending;
  const isConfirmed = booking.status === ConsultationBookingStatus.Confirmed;
  const hasMeetingLink = Boolean(booking.meeting_link);
  const lwtpDetailRows = formatLwtpBookingDetailRows(booking.details);

  return (
    <PageContainer width={PAGE_WIDTH} className="py-10 max-sm:py-5">
      <Card>
        <CardHeader>
          <CardTitle>Your consultation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {isCancelled ? (
            <p className="text-sm text-text-secondary">
              This consultation was cancelled. You can close this page.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-sm font-medium text-text-primary">
                  {booking.consultant_name}
                </p>
                <p className="text-sm text-text-secondary">{when}</p>
                {isPending ? (
                  <p className="text-sm text-text-secondary">
                    Waiting for {booking.consultant_name} to confirm. Check your
                    email for updates.
                  </p>
                ) : null}
                {isConfirmed ? (
                  <p className="text-sm text-text-secondary">
                    Your consultation is confirmed.
                  </p>
                ) : null}
              </div>

              <div className="rounded-md border border-border bg-surface-elevated px-3 py-3">
                <p className="text-sm font-medium text-text-primary">Your details</p>
                <dl className="mt-2 space-y-1.5">
                  <div>
                    <dt className="text-xs font-medium text-text-secondary">Name</dt>
                    <dd className="text-sm text-text-primary">{booking.student_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-text-secondary">Email</dt>
                    <dd className="text-sm text-text-primary">{booking.student_email}</dd>
                  </div>
                  {lwtpDetailRows.map((row) => (
                    <div key={row.label}>
                      <dt className="text-xs font-medium text-text-secondary">{row.label}</dt>
                      <dd className="text-sm text-text-primary">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {(hasMeetingLink || booking.can_cancel) ? (
                <div className="flex flex-wrap gap-2">
                  {hasMeetingLink ? (
                    <Link
                      href={booking.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
                    >
                      Join meeting
                    </Link>
                  ) : null}

                  {booking.can_cancel ? (
                    <>
                      {cancelMutation.isError ? (
                        <p className="w-full text-sm text-danger" role="alert">
                          {parseSchedjuiceApiError(
                            cancelMutation.error,
                            "Could not cancel this booking.",
                          )}
                        </p>
                      ) : null}
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
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

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
    </PageContainer>
  );
}
