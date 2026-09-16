"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { EditPencil } from "iconoir-react";

import { Input } from "@/components/primitives";
import { Tooltip } from "@/components/primitives/tooltip";
import { CellSaveFeedback } from "@/components/edit-kit/cell-save-feedback";
import type { UseCellAutosaveReturn } from "@/components/edit-kit/use-cell-autosave";
import { cn } from "@/lib/utils";

export type CellAutosaveInputProps = {
  autosave: Pick<
    UseCellAutosaveReturn<string>,
    "displayValue" | "setLocalValue" | "commit" | "status" | "showSavedTick"
  >;
  formatDisplay?: (value: string) => ReactNode;
  inputClassName?: string;
  displayClassName?: string;
  emptyDisplay?: ReactNode;
};

export function CellAutosaveInput({
  autosave,
  formatDisplay,
  inputClassName,
  displayClassName,
  emptyDisplay = "—",
}: CellAutosaveInputProps) {
  const { displayValue, setLocalValue, commit, status, showSavedTick } =
    autosave;

  const [isEditing, setIsEditing] = useState(false);
  const valueAtEditStartRef = useRef(displayValue);

  const startEditing = useCallback(() => {
    valueAtEditStartRef.current = displayValue;
    setIsEditing(true);
  }, [displayValue]);

  const finishEditing = useCallback(() => {
    void commit();
    setIsEditing(false);
  }, [commit]);

  const cancelEditing = useCallback(() => {
    setLocalValue(valueAtEditStartRef.current);
    setIsEditing(false);
  }, [setLocalValue]);

  const displayContent =
    displayValue.trim() === ""
      ? emptyDisplay
      : formatDisplay
        ? formatDisplay(displayValue)
        : displayValue;

  return (
    <div className="flex min-w-min items-start gap-2">
      {isEditing ? (
        <Input
          autoFocus
          value={displayValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={finishEditing}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.currentTarget as HTMLInputElement).blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEditing();
            }
          }}
          className={inputClassName}
        />
      ) : (
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <button
                type="button"
                aria-label="Click to edit"
                onClick={startEditing}
                className={cn(
                  "group/cell flex min-w-0 items-center gap-1 cursor-text rounded-md text-left text-sm text-text-primary",
                  "hover:bg-surface-hover",
                  "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
                  displayClassName,
                )}
              >
                <span>{displayContent}</span>
                <EditPencil
                  className="size-3.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover/cell:opacity-100"
                  aria-hidden
                />
              </button>
            }
          />
          <Tooltip.Portal>
            <Tooltip.Positioner>
              <Tooltip.Popup>Click to edit</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      )}
      <CellSaveFeedback status={status} showSavedTick={showSavedTick} />
    </div>
  );
}
