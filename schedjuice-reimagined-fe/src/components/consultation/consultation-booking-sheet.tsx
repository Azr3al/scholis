"use client";

import { ConsultationBookingExpandableCard } from "@/components/consultation/consultation-booking-expandable-card";
import { Sheet } from "@/components/primitives";
import {
  bookingStatusLabel,
  formatBookingWhen,
} from "@/lib/consultation/booking-display";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";
import type { organizationType } from "@/types/organization";
import type { ConsultationBooking } from "@/types/consultation";

type ConsultationBookingSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: ConsultationBooking | null;
  tenant: organizationType | null;
  canManage: boolean;
  actionsDisabled: boolean;
  approvingBookingId: number | null;
  decliningBookingId: number | null;
  onApprove: (bookingId: number) => void;
  onCancel: (bookingId: number) => void;
};

export function ConsultationBookingSheet({
  open,
  onOpenChange,
  booking,
  tenant,
  canManage,
  actionsDisabled,
  approvingBookingId,
  decliningBookingId,
  onApprove,
  onCancel,
}: ConsultationBookingSheetProps) {
  if (!booking) {
    return null;
  }

  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const timePattern = orgTimeDateFnsPattern(timeFormat);
  const when = formatBookingWhen(booking, tenant?.timezone, timePattern);
  const statusLabel = bookingStatusLabel(booking);

  return (
    <Sheet.Root open={open} onOpenChange={onOpenChange}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup className="w-full overflow-y-auto sm:max-w-md">
          <Sheet.Title>{booking.student_name}</Sheet.Title>
          <Sheet.Description>
            {[when, statusLabel].filter(Boolean).join(" · ")}
          </Sheet.Description>

          <div className="mt-4">
            <ConsultationBookingExpandableCard
              booking={booking}
              tenant={tenant}
              expanded
              onExpandedChange={() => {}}
              showDate
              canManage={canManage}
              isApproving={approvingBookingId === booking.id}
              isDeclining={decliningBookingId === booking.id}
              actionsDisabled={actionsDisabled}
              onApprove={onApprove}
              onCancel={onCancel}
            />
          </div>
        </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
