"use client";

import {
  AlertDialog,
  Button,
  Radio,
  RadioGroup,
} from "@/components/primitives";
import { formatDate } from "@/helpers/date";
import {
  matchingSeriesSessions,
  markDeleted,
  type SeriesScope,
} from "@/helpers/course-schedule-draft";
import type { eventType } from "@/types/course";
import { useMemo, useState } from "react";

export type DeleteSessionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: eventType | null;
  flatEvents: Partial<eventType>[];
  orgTimezone: string;
  onConfirm: (next: eventType[]) => void;
  /** Session-credit: delete this session only; hide series radios. */
  hideSeriesOptions?: boolean;
};

export function DeleteSessionsDialog({
  open,
  onOpenChange,
  anchor,
  flatEvents,
  orgTimezone,
  onConfirm,
  hideSeriesOptions = false,
}: DeleteSessionsDialogProps) {
  const [scope, setScope] = useState<SeriesScope>("only_this");
  const effectiveScope: SeriesScope = hideSeriesOptions ? "only_this" : scope;

  const selection = useMemo(() => {
    if (!anchor) {
      return { deletable: [], protectedByCheckin: [] };
    }
    return matchingSeriesSessions(flatEvents, anchor, effectiveScope, { orgTimezone });
  }, [anchor, flatEvents, orgTimezone, effectiveScope]);

  const anchorLabel = anchor
    ? `${formatDate(new Date(anchor.date as string | Date), "EEE, MMM d")} · ${anchor.time_from?.slice(0, 5)} – ${anchor.time_to?.slice(0, 5)}`
    : "";

  const futureCount = useMemo(() => {
    if (!anchor) return 0;
    return matchingSeriesSessions(flatEvents, anchor, "future", { orgTimezone })
      .deletable.length;
  }, [anchor, flatEvents, orgTimezone]);

  const allCount = useMemo(() => {
    if (!anchor) return 0;
    return (
      matchingSeriesSessions(flatEvents, anchor, "all", { orgTimezone }).deletable
        .length +
      matchingSeriesSessions(flatEvents, anchor, "all", { orgTimezone })
        .protectedByCheckin.length
    );
  }, [anchor, flatEvents, orgTimezone]);

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop />
        <AlertDialog.Popup className="sm:max-w-md">
          <AlertDialog.Title>Delete session</AlertDialog.Title>
          <AlertDialog.Description>
            <div className="space-y-4 pt-2">
              {hideSeriesOptions ? (
                <p className="text-sm">
                  Only this session
                  {anchor ? (
                    <span className="mt-1 block text-text-muted">{anchorLabel}</span>
                  ) : null}
                </p>
              ) : (
              <RadioGroup
                value={scope}
                onValueChange={(value) => setScope(value as SeriesScope)}
                className="flex flex-col gap-3"
              >
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <Radio value="only_this" className="mt-0.5" />
                  <span>
                    Only this session
                    {anchor ? (
                      <span className="block text-text-muted">{anchorLabel}</span>
                    ) : null}
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <Radio value="future" className="mt-0.5" />
                  <span>
                    All future matching sessions
                    <span className="block text-text-muted tabular-nums">
                      {futureCount} session{futureCount === 1 ? "" : "s"}
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <Radio value="all" className="mt-0.5" />
                  <span>
                    All matching sessions, including past
                    <span className="block text-text-muted tabular-nums">
                      {allCount} session{allCount === 1 ? "" : "s"}
                    </span>
                  </span>
                </label>
              </RadioGroup>
              )}
              {selection.protectedByCheckin.length > 0 ? (
                <p className="text-sm text-warning-foreground">
                  {selection.protectedByCheckin.length} past session
                  {selection.protectedByCheckin.length === 1 ? "" : "s"} have
                  attendance and will be kept.
                </p>
              ) : null}
            </div>
          </AlertDialog.Description>
          <div className="flex justify-end gap-2 pt-4">
            <AlertDialog.Close type="button" className="rounded-md border border-border px-3 py-2 text-sm">
              Cancel
            </AlertDialog.Close>
            <Button
              variant="danger"
              disabled={!anchor || selection.deletable.length === 0}
              onClick={() => {
                if (!anchor) return;
                const next = markDeleted(
                  flatEvents,
                  selection.deletable,
                ) as eventType[];
                onConfirm(next);
                onOpenChange(false);
              }}
            >
              Delete {selection.deletable.length} session
              {selection.deletable.length === 1 ? "" : "s"}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
