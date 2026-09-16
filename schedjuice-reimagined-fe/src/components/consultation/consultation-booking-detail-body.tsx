"use client";

import { issueConsultationBookingManageLink } from "@/app/client-api/consultation";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import { Button, useToast } from "@/components/primitives";
import { formatLwtpBookingDetailRows } from "@/lib/consultation/lwtp-booking-fields";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { toAbsoluteWebUrl } from "@/lib/public-web-paths";
import type { organizationType } from "@/types/organization";
import {
  ConsultationBookingStatus,
  type ConsultationBooking,
} from "@/types/consultation";
import { ClipboardCheck as CopyCheck, Copy } from "iconoir-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ConsultationBookingDetailBodyProps = {
  booking: ConsultationBooking;
  tenant: organizationType | null;
  canManage: boolean;
  isApproving: boolean;
  isDeclining: boolean;
  actionsDisabled: boolean;
  onApprove: (bookingId: number) => void;
  onCancel: (bookingId: number) => void;
};

export function ConsultationBookingDetailBody({
  booking,
  tenant,
  canManage,
  isApproving,
  isDeclining,
  actionsDisabled,
  onApprove,
  onCancel,
}: ConsultationBookingDetailBodyProps) {
  const toast = useToast();
  const [origin, setOrigin] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isCopyingLink, setIsCopyingLink] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const studentBookingUrl = useMemo(
    () => toAbsoluteWebUrl(booking.booking_url ?? "", origin),
    [booking.booking_url, origin],
  );

  const detailRows = formatLwtpBookingDetailRows(booking.details);
  const isCancelled = booking.status === ConsultationBookingStatus.Cancelled;
  const isPending = booking.status === ConsultationBookingStatus.Pending;
  const bookingId = booking.id;

  async function handleCopyStudentLink() {
    if (isCopyingLink) return;

    setIsCopyingLink(true);
    try {
      let url = studentBookingUrl;
      if (!url) {
        const issued = await issueConsultationBookingManageLink(bookingId);
        url = toAbsoluteWebUrl(issued.booking_url, origin);
      }
      if (!url) {
        throw new Error("No student link available for this booking.");
      }
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      toast.add({ description: "Student link copied." });
      window.setTimeout(() => setIsCopied(false), 1500);
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not copy link",
        description: parseSchedjuiceApiError(error),
      });
    } finally {
      setIsCopyingLink(false);
    }
  }

  return (
    <>
      <dl className="space-y-3">
        <div>
          <dt className="text-xs font-medium text-text-secondary">Email</dt>
          <dd className="text-sm text-text-primary">{booking.student_email}</dd>
        </div>
        {detailRows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs font-medium text-text-secondary">{row.label}</dt>
            <dd className="text-sm text-text-primary">{row.value}</dd>
          </div>
        ))}
      </dl>

      {!isCancelled && booking.meeting_link ? (
        <Link
          href={booking.meeting_link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          Open meeting link
        </Link>
      ) : null}

      {!isCancelled ? (
        <div className="mt-4 space-y-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={isCopyingLink}
            isLoading={isCopyingLink}
            onClick={() => void handleCopyStudentLink()}
          >
            {!isCopyingLink && isCopied ? (
              <CopyCheck className="size-4" aria-hidden />
            ) : !isCopyingLink ? (
              <Copy className="size-4" aria-hidden />
            ) : null}
            Copy student link
          </Button>
          <p className="text-xs text-muted-foreground">
            Send this if the student lost their confirmation page.
          </p>
        </div>
      ) : null}

      {canManage && !isCancelled ? (
        <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
          {isPending ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={actionsDisabled}
              isLoading={isApproving}
              onClick={() => onApprove(booking.id)}
            >
              Approve
            </Button>
          ) : null}
          <ConfirmationDialog
            title={isPending ? "Decline this request?" : "Cancel this booking?"}
            content={
              isPending
                ? "The student will be notified that this time is not available."
                : "The student will no longer have this time reserved."
            }
            onConfirm={() => onCancel(booking.id)}
            isLoading={isDeclining}
          >
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={actionsDisabled}
            >
              {isPending ? "Decline" : "Cancel booking"}
            </Button>
          </ConfirmationDialog>
        </div>
      ) : null}
    </>
  );
}
