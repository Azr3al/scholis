"use client";
import { Popover } from "@/components/primitives";
import { Calendar } from "@/components/date/calendar";

import { format, isValid, parseISO } from "date-fns";

import type { ImportFieldDef } from "@/app/client-api/imports";
import { importFieldLabel } from "@/lib/imports/wizard-logic";

export type DateCellEditorTarget = {
  sourceRow: number;
  field: string;
  value: string;
  rect: { x: number; y: number; width: number; height: number };
};

function parseIsoDate(value: string): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
}

export function DateCellEditor({
  target,
  fields,
  onPick,
  onClose,
}: {
  target: DateCellEditorTarget | null;
  fields: ImportFieldDef[];
  onPick: (sourceRow: number, field: string, value: string) => void;
  onClose: () => void;
}) {
  if (!target) return null;

  const selected = parseIsoDate(target.value);
  const label = importFieldLabel(fields, target.field);

  return (
    <Popover.Root open onOpenChange={(open) => !open && onClose()}>
      <Popover.Trigger render={<div
          style={{
            position: "fixed",
            left: target.rect.x,
            top: target.rect.y + target.rect.height,
            width: target.rect.width,
            height: 0,
          }}
        />} />
      <Popover.Portal>
        <Popover.Positioner align="start">
        <Popover.Popup
        data-date-cell-editor
        className="click-outside-ignore z-dropdown w-auto p-0"
      >
        <div className="border-b px-3 py-2 text-xs text-muted-foreground">
          {label}
        </div>
        <Calendar
          mode="single"
          captionLayout="dropdown-buttons"
          selected={selected}
          onSelect={(date) => {
            if (!date) return;
            onPick(target.sourceRow, target.field, format(date, "yyyy-MM-dd"));
          }}
          initialFocus
          defaultMonth={selected}
          fromYear={1940}
          toYear={new Date().getFullYear() + 20}
        />
        <button
          type="button"
          className="w-full border-t px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(target.sourceRow, target.field, "")}
        >
          Clear date
        </button>
      </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
