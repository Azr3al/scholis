"use client";

import { Button, Dialog } from "@/components/primitives";
import { formatDate } from "@/helpers/date";
import { isPastEvent } from "@/helpers/calendar";
import { formatTimeslotRangeForDisplay } from "@/helpers/timeslot";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";
import type { eventType } from "@/types/course";

export type SessionActionsDialogProps = {
  session: eventType | null;
  displayTitle: string;
  orgTimezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function SessionActionsDialog({
  session,
  displayTitle,
  orgTimezone,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: SessionActionsDialogProps) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  if (!session) return null;

  const isPast = isPastEvent(session, orgTimezone);
  const hasCheckin = session.has_checkin === true;
  const canDelete = !hasCheckin;
  const canEdit = !isPast;
  const dateLabel = formatDate(new Date(session.date as string | Date), "EEE, MMM d");
  const timeLabel =
    session.time_from && session.time_to
      ? formatTimeslotRangeForDisplay(
          {
            date: String(session.date).split("T")[0],
            time_from: session.time_from,
            time_to: session.time_to,
          },
          orgTimezone,
          orgTimeDateFnsPattern(timeFormat),
        )
      : "";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="sm:max-w-sm">
          <div>
            <Dialog.Title className="truncate">{displayTitle}</Dialog.Title>
            <Dialog.Description>
              {dateLabel}
              {timeLabel ? ` · ${timeLabel}` : ""}
              {isPast && hasCheckin ? (
                <span className="mt-1 block text-text-muted">
                  Completed · has attendance — cannot delete
                </span>
              ) : isPast ? (
                <span className="mt-1 block text-text-muted">
                  Completed · time cannot be edited
                </span>
              ) : null}
            </Dialog.Description>
          </div>
          {canEdit || canDelete ? (
            <div className="flex flex-col gap-2">
              {canEdit ? (
                <Button type="button" variant="secondary" onClick={onEdit}>
                  Edit time…
                </Button>
              ) : null}
              {canDelete ? (
                <Button type="button" variant="danger" onClick={onDelete}>
                  Delete…
                </Button>
              ) : null}
              {!canEdit ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
              ) : null}
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
