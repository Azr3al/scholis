"use client";
import { Button, Menu } from "@/components/primitives";

import { ViewColumns3 as Columns3 } from "iconoir-react";
import { cn } from "@/lib/utils";

export interface ColumnsMenuColumn {
  field: string;
  title: string;
  hidden: boolean;
}

export function ColumnsMenu({
  columns,
  onToggle,
  onFitAll,
  onReset,
  compact = false,
}: {
  columns: ColumnsMenuColumn[];
  onToggle: (field: string, visible: boolean) => void;
  onFitAll: () => void;
  onReset: () => void;
  compact?: boolean;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 gap-1 text-[11px] text-foreground/70",
              compact ? "px-1.5" : "px-2",
            )}
            title="Columns"
            aria-label="Columns"
          >
            <Columns3 className="size-3.5" aria-hidden />
            {!compact ? "Columns" : null}
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="start">
          <Menu.Popup className="min-w-48">
            {columns.map((c) => (
              <Menu.CheckboxItem
                key={c.field}
                checked={!c.hidden}
                onCheckedChange={(checked) => onToggle(c.field, Boolean(checked))}
                onClick={(e) => e.preventDefault()}
              >
                {c.title}
              </Menu.CheckboxItem>
            ))}
            <Menu.Separator />
            <Menu.Item onClick={() => onFitAll()}>Fit all to content</Menu.Item>
            <Menu.Item onClick={() => onReset()}>Reset layout</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
