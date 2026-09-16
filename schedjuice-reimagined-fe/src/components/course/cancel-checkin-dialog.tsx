"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  Field,
  Radio,
  RadioGroup,
  Textarea,
} from "@/components/primitives";
import {
  CancelCheckinReason,
  CANCEL_CHECKIN_REASON_CODES,
  cancelCheckinReasonLabel,
  isCancelCheckinSubmitEnabled,
} from "@/helpers/cancel-checkin";

interface CancelCheckinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading?: boolean;
  onConfirm: (payload: { reasonCode: CancelCheckinReason; note: string }) => void;
}

export function CancelCheckinDialog({
  open,
  onOpenChange,
  isLoading,
  onConfirm,
}: CancelCheckinDialogProps) {
  const [reasonCode, setReasonCode] = useState<CancelCheckinReason>(
    CancelCheckinReason.StudentNoShow,
  );
  const [note, setNote] = useState("");

  const canSubmit = isCancelCheckinSubmitEnabled(reasonCode, note);
  const noteRequired = reasonCode === CancelCheckinReason.Other;

  const resetForm = () => {
    setReasonCode(CancelCheckinReason.StudentNoShow);
    setNote("");
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!isLoading) {
          onOpenChange(next);
          if (!next) {
            resetForm();
          }
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <div>
            <Dialog.Title>Cancel check-in</Dialog.Title>
            <Dialog.Description>
              Cancel this check-in if the student did not show up. You can check in again
              if they arrive.
            </Dialog.Description>
          </div>

          <RadioGroup
            value={reasonCode}
            onValueChange={(value) => setReasonCode(value as CancelCheckinReason)}
            className="space-y-2"
          >
            {CANCEL_CHECKIN_REASON_CODES.map((code) => (
              <label
                key={code}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-3"
              >
                <Radio value={code} disabled={isLoading} />
                <span className="text-sm">{cancelCheckinReasonLabel(code)}</span>
              </label>
            ))}
          </RadioGroup>

          <Field.Root className="space-y-2">
            <Field.Label htmlFor="cancel-checkin-note">
              Note{noteRequired ? " (required)" : " (optional)"}
            </Field.Label>
            <Textarea
              id="cancel-checkin-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add a short note…"
              rows={3}
              disabled={isLoading}
            />
            {noteRequired && note.trim().length === 0 ? (
              <Field.Description>A note is required when you choose Other.</Field.Description>
            ) : null}
          </Field.Root>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isLoading}
              disabled={!canSubmit || isLoading}
              onClick={() => onConfirm({ reasonCode, note })}
            >
              Confirm cancel
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
