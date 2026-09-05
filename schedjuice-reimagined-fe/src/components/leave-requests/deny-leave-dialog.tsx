"use client";

import { useMemo, useState } from "react";

import { Button, Textarea } from "@/components/primitives";
import { AlertDialog } from "@/components/primitives";

type DenyLeaveDialogProps = {
  open: boolean;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (denialReason: string) => void;
};

export function DenyLeaveDialog({
  open,
  isLoading,
  onOpenChange,
  onConfirm,
}: DenyLeaveDialogProps) {
  const [reason, setReason] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next && isLoading) return;
    if (!next) setReason("");
    onOpenChange(next);
  };

  const trimmed = reason.trim();
  const canConfirm = trimmed.length > 0 && !isLoading;

  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop />
        <AlertDialog.Popup>
          <AlertDialog.Title>Deny leave request</AlertDialog.Title>
          <AlertDialog.Description>
            Tell the student why this request was denied. They will see your note.
          </AlertDialog.Description>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason for denial"
            disabled={isLoading}
            aria-label="Denial reason"
          />
          <div className="flex justify-end gap-2 pt-2">
            <AlertDialog.Close
              render={<Button type="button" variant="ghost" disabled={isLoading} />}
            >
              Cancel
            </AlertDialog.Close>
            <Button
              type="button"
              variant="danger"
              isLoading={isLoading}
              disabled={!canConfirm}
              onClick={() => onConfirm(trimmed)}
            >
              Deny request
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function isDenyConfirmEnabled(reason: string, isLoading: boolean): boolean {
  return reason.trim().length > 0 && !isLoading;
}
