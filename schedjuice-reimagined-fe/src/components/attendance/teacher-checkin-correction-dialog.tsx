"use client";
import { Button, Dialog, Textarea, buttonVariants } from "@/components/primitives";

import { useState } from "react";

const MIN_REASON_LENGTH = 10;

export function TeacherCheckinCorrectionDialog({
  open,
  onOpenChange,
  isLoading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= MIN_REASON_LENGTH;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!isLoading) {
          onOpenChange(next);
          if (!next) setReason("");
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
        <div>
          <Dialog.Title>Save check-in changes</Dialog.Title>
          <Dialog.Description>
            Briefly explain why these check-in details are being added or
            corrected — for example a missed check-in, updated screenshot,
            session notes, or an admin backfill for a teacher.
          </Dialog.Description>
        </div>
        <div className="space-y-2">
          <label htmlFor="correction-reason">Reason</label>
          <Textarea
            id="correction-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Missed check-in because the app lost connection during class"
            disabled={isLoading}
            rows={4}
          />
          <p className="text-xs text-text-muted">
            At least {MIN_REASON_LENGTH} characters.
          </p>
        </div>
        <div>
          <Button
            type="button"
            variant="secondary" onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            isLoading={isLoading}
            disabled={!canSubmit || isLoading}
            onClick={() => onConfirm(trimmed)}
          >
            Save changes
          </Button>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
