"use client";

import { MoreHoriz } from "iconoir-react";
import type { ReactNode } from "react";

import { Button } from "@/components/primitives";
import { Menu } from "@/components/primitives/menu";

export type ColumnHeaderMenuProps = {
  label: ReactNode;
  columnId: string;
  sorted: "asc" | "desc" | false;
  enableSorting: boolean;
  enableCopy: boolean;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClearSort: () => void;
  onCopy: () => void;
};

export function ColumnHeaderMenu({
  label,
  columnId,
  sorted,
  enableSorting,
  enableCopy,
  onSortAsc,
  onSortDesc,
  onClearSort,
  onCopy,
}: ColumnHeaderMenuProps) {
  const labelText = typeof label === "string" ? label : columnId;
  if (!enableSorting && !enableCopy) {
    return (
      <span className="font-sans text-sm font-medium text-text-secondary">
        {label}
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <span className="font-sans text-sm font-medium text-text-secondary">
        {label}
      </span>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label={`Column actions for ${labelText}`}
            />
          }
        >
          <MoreHoriz width={14} height={14} aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="start">
            <Menu.Popup>
              {enableSorting ? (
                <>
                  <Menu.Item onClick={onSortAsc}>Sort ascending</Menu.Item>
                  <Menu.Item onClick={onSortDesc}>Sort descending</Menu.Item>
                  {sorted ? (
                    <Menu.Item onClick={onClearSort}>Clear sort</Menu.Item>
                  ) : null}
                  {enableCopy ? <Menu.Separator /> : null}
                </>
              ) : null}
              {enableCopy ? (
                <Menu.Item onClick={onCopy}>Copy column</Menu.Item>
              ) : null}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
