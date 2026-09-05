"use client";
import { Popover } from "@/components/primitives";

import { Check } from "iconoir-react";

import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/types/lead";

export type StatusPickerTarget = {
  leadId: number;
  currentStatusId: number;
  rect: { x: number; y: number; width: number; height: number };
};

export function StatusPickerPopover({
  target,
  statuses,
  onSelect,
  onClose,
}: {
  target: StatusPickerTarget | null;
  statuses: LeadStatus[];
  onSelect: (status: LeadStatus) => void;
  onClose: () => void;
}) {
  if (!target) return null;

  return (
    <Popover.Root open onOpenChange={(open) => !open && onClose()}>
      <Popover.Trigger render={<div
          style={{
            position: "fixed",
            left: target.rect.x,
            top: target.rect.y + target.rect.height,
            width: Math.max(target.rect.width, 1),
            height: 0,
          }}
        />} />
      <Popover.Portal>
        <Popover.Positioner align="start">
        <Popover.Popup
        className="click-outside-ignore z-dropdown w-56 p-1"
      >
        <div role="listbox" className="max-h-72 overflow-y-auto">
          {statuses.map((status) => {
            const selected = status.id === target.currentStatusId;
            return (
              <button
                key={status.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(status)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quiet)] hover:bg-surface-hover",
                  selected && "bg-surface-active font-medium",
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: status.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{status.name}</span>
                {selected ? (
                  <Check
                    className="size-4 shrink-0 text-text-muted"
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
