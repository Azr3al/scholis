"use client";

import { ConsultationBookingDetailBody } from "@/components/consultation/consultation-booking-detail-body";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/misc/collapsible";
import {
  bookingStatusLabel,
  formatBookingTimeOnly,
  formatBookingWhen,
} from "@/lib/consultation/booking-display";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";
import type { organizationType } from "@/types/organization";
import type { ConsultationBooking } from "@/types/consultation";
import { NavArrowDown as ChevronDown } from "iconoir-react";
import { cn } from "@/lib/utils";

type ConsultationBookingExpandableCardProps = {
  booking: ConsultationBooking;
  tenant: organizationType | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  showDate?: boolean;
  canManage: boolean;
  isApproving: boolean;
  isDeclining: boolean;
  actionsDisabled: boolean;
  onApprove: (bookingId: number) => void;
  onCancel: (bookingId: number) => void;
};

export function ConsultationBookingExpandableCard({
  booking,
  tenant,
  expanded,
  onExpandedChange,
  showDate = true,
  canManage,
  isApproving,
  isDeclining,
  actionsDisabled,
  onApprove,
  onCancel,
}: ConsultationBookingExpandableCardProps) {
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const timePattern = orgTimeDateFnsPattern(timeFormat);
  const when = showDate
    ? formatBookingWhen(booking, tenant?.timezone, timePattern)
    : formatBookingTimeOnly(booking, tenant?.timezone, timePattern);
  const statusLabel = bookingStatusLabel(booking);

  return (
    <Collapsible
      open={expanded}
      onOpenChange={onExpandedChange}
      className="rounded-md border border-border"
    >
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={expanded}
          />
        }
      >
        <span className="min-w-0 space-y-1">
          <span className="block text-sm font-medium text-primary">
            {booking.student_name}
          </span>
          <span className="block text-sm text-muted-foreground">{when}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {booking.student_email}
          </span>
          {statusLabel ? (
            <span className="block text-xs text-muted-foreground">{statusLabel}</span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border px-4 py-3">
          <ConsultationBookingDetailBody
            booking={booking}
            tenant={tenant}
            canManage={canManage}
            isApproving={isApproving}
            isDeclining={isDeclining}
            actionsDisabled={actionsDisabled}
            onApprove={onApprove}
            onCancel={onCancel}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
