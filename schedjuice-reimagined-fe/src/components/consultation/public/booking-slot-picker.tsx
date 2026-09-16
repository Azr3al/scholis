"use client";

import { Button, Skeleton } from "@/components/primitives";
import { formatSessionClock } from "@/helpers/date";
import type { ConsultationAvailabilitySlot } from "@/types/consultation";
import { cn } from "@/lib/utils";

type BookingSlotPickerProps = {
  slots: ConsultationAvailabilitySlot[];
  selectedScheduledAt: string | null;
  onSelectSlot: (slot: ConsultationAvailabilitySlot) => void;
  slotDurationMinutes: number;
  isLoading: boolean;
  selectedDateLabel: string;
};

export function BookingSlotPicker({
  slots,
  selectedScheduledAt,
  onSelectSlot,
  slotDurationMinutes,
  isLoading,
  selectedDateLabel,
}: BookingSlotPickerProps) {
  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <p className="text-sm text-text-secondary">
          Loading times for {selectedDateLabel}…
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (!slots.length) {
    return (
      <p className="text-sm text-text-secondary">
        No open times on {selectedDateLabel}. Pick another date.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        {selectedDateLabel} · {slotDurationMinutes}-minute sessions
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {slots.map((slot) => {
          const isSelected = selectedScheduledAt === slot.scheduled_at;
          return (
            <Button
              key={slot.scheduled_at}
              type="button"
              variant={isSelected ? "primary" : "secondary"}
              className={cn("w-full", isSelected && "ring-2 ring-ring")}
              onClick={() => onSelectSlot(slot)}
            >
              {formatSessionClock(slot.slot_time)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
