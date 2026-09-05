"use client";

import { Button, Dialog } from "@/components/primitives";
import { RequiredMark } from "@/components/form/required-mark";
import { stringToTimeValue } from "@/helpers/date";
import { validateRescheduleTimes } from "@/helpers/calendar-reschedule";
import { useState } from "react";
import TimeSelect from "./time-select";

export type RescheduleConflictsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictCount: number;
  primaryLabel: "Apply & add" | "Apply";
  isSubmitting?: boolean;
  error?: string | null;
  onApply: (times: {
    time_from: string;
    time_to: string;
  }) => void | Promise<void>;
};

export function RescheduleConflictsDialog({
  open,
  onOpenChange,
  conflictCount,
  primaryLabel,
  isSubmitting = false,
  error = null,
  onApply,
}: RescheduleConflictsDialogProps) {
  const [timeFrom, setTimeFrom] = useState<string | null>(null);
  const [timeTo, setTimeTo] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTimeFrom(null);
      setTimeTo(null);
      setLocalError(null);
    }
    onOpenChange(next);
  };

  const handleApply = async () => {
    const validationError = validateRescheduleTimes(timeFrom, timeTo);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError(null);
    await onApply({ time_from: timeFrom!, time_to: timeTo! });
  };

  const displayError = localError || error;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Popup className="sm:max-w-md">
          <Dialog.Title>Reschedule conflicting sessions</Dialog.Title>
          <Dialog.Description>
            {conflictCount} future session{conflictCount === 1 ? "" : "s"} will
            use these times.
          </Dialog.Description>
          <div className="space-y-3 pt-2">
            <div>
              <label htmlFor="reschedule_time_from">
                Start time
                <RequiredMark />
              </label>
              <TimeSelect
                value={timeFrom ? stringToTimeValue(timeFrom) : null}
                onChange={(e) => setTimeFrom(e?.toString() ?? null)}
              />
            </div>
            <div>
              <label htmlFor="reschedule_time_to">
                End time
                <RequiredMark />
              </label>
              <TimeSelect
                value={timeTo ? stringToTimeValue(timeTo) : null}
                onChange={(e) => setTimeTo(e?.toString() ?? null)}
              />
            </div>
            {displayError ? (
              <p className="text-sm text-destructive">{displayError}</p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              isLoading={isSubmitting}
              onClick={() => void handleApply()}
            >
              {isSubmitting ? "Fixing…" : primaryLabel}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
