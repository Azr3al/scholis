"use client";

import { AlertDialog, Button } from "@/components/primitives";
import type { AutosaveStatus } from "./use-quiz-autosave";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unansweredCount: number;
  /** Fire submit after optional autosave flush (async). */
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
  /** After repeated failures, block another submit until refresh. */
  confirmDisabled?: boolean;
  confirmBlockedHint?: string;
  isFinishingSave?: boolean;
  autosaveStatus?: AutosaveStatus;
};

export function SubmitConfirmation({
  open,
  onOpenChange,
  unansweredCount,
  onConfirm,
  isLoading,
  confirmDisabled = false,
  confirmBlockedHint,
  isFinishingSave = false,
  autosaveStatus,
}: Props) {
  const blocking = Boolean(isLoading || isFinishingSave);
  const showFinishingSave =
    isFinishingSave && autosaveStatus === "saving" && !isLoading;
  let primaryLabel = "Submit";
  if (isLoading) {
    primaryLabel = "Submitting…";
  } else if (showFinishingSave) {
    primaryLabel = "Finishing save…";
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && blocking) return;
    onOpenChange(next);
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop />
        <AlertDialog.Popup>
          <AlertDialog.Title>Submit quiz?</AlertDialog.Title>
          <AlertDialog.Description>
            {confirmBlockedHint ? (
              <span className="text-danger">{confirmBlockedHint}</span>
            ) : unansweredCount > 0 ? (
              `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? "" : "s"}. You can go back or submit anyway.`
            ) : (
              "You answered every question. Submit when you are ready."
            )}
          </AlertDialog.Description>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Close
              render={<Button variant="secondary" disabled={blocking}>Keep working</Button>}
            />
            <Button
              type="button"
              isLoading={blocking}
              disabled={confirmDisabled || blocking}
              onClick={() => void onConfirm()}
            >
              {primaryLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
