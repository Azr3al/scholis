"use client";
import { Button, Input, useToast } from "@/components/primitives";

import { formatDateTime } from "@/helpers/date";
import { QuizStatus } from "@/types/quiz-v3";
import { Copy, Check as CopyCheck } from "iconoir-react";
import { useState } from "react";

function scheduleHint(
  activationDate: string | null | undefined,
  expiryDate: string | null | undefined,
): string | null {
  const parts: string[] = [];
  if (activationDate) {
    parts.push(`Opens ${formatDateTime(activationDate)}`);
  }
  if (expiryDate) {
    parts.push(`Closes ${formatDateTime(expiryDate)}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function QuizTakeLinkCard({
  takeUrl,
  status,
  activationDate,
  expiryDate,
  allowedMinutes,
  maxRetakes,
  onStatusChange,
  isStatusPending = false,
}: {
  takeUrl: string;
  status: QuizStatus;
  activationDate?: string | null;
  expiryDate?: string | null;
  allowedMinutes: number;
  maxRetakes: number;
  /** When set, Open to students / Close quiz controls are shown in this card. */
  onStatusChange?: (next: QuizStatus) => void;
  isStatusPending?: boolean;
}) {
  const toast = useToast();
  const [isCopied, setIsCopied] = useState(false);
  const schedule = scheduleHint(activationDate, expiryDate);

  let helper: string;
  if (status === QuizStatus.Open) {
    helper =
      "Students can use this link to take the quiz while it is open to new attempts.";
    if (schedule) {
      helper += ` Schedule: ${schedule}.`;
    }
  } else if (status === QuizStatus.Draft) {
    helper =
      "This link will not start new attempts until you open the quiz to students.";
    if (schedule) {
      helper += ` ${schedule}`;
    }
  } else {
    helper =
      "The quiz is closed. This link will not accept new attempts until you open the quiz again.";
  }

  return (
    <div className="bg-surface-sunken/40 rounded-md border p-4 text-sm">
      <p className="font-medium">Student link</p>
      <div className="mt-2 flex gap-2">
        <Input readOnly value={takeUrl} className="min-w-0 font-mono text-xs" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shrink-0 size-8 p-0"
          aria-label="Copy link to clipboard"
          onClick={() => {
            void navigator.clipboard.writeText(takeUrl).then(() => {
              setIsCopied(true);
              toast.add({ description: "Link copied." });
              setTimeout(() => setIsCopied(false), 1500);
            });
          }}
        >
          {isCopied ? (
            <CopyCheck className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
        </Button>
      </div>
      <p className="text-text-muted mt-2 text-xs leading-relaxed">
        {helper}
      </p>
      {onStatusChange ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {status === QuizStatus.Draft || status === QuizStatus.Closed ? (
            <Button
              type="button"
              size="sm"
              isLoading={isStatusPending}
              onClick={() => onStatusChange(QuizStatus.Open)}
            >
              Open to students
            </Button>
          ) : null}
          {status === QuizStatus.Open ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              isLoading={isStatusPending}
              onClick={() => onStatusChange(QuizStatus.Closed)}
            >
              Close quiz
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="text-text-muted mt-3 border-t pt-3 text-xs">
        Time limit: {allowedMinutes} min · Max attempts: {maxRetakes}
      </p>
    </div>
  );
}
