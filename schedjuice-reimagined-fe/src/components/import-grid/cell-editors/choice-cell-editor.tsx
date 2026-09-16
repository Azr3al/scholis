"use client";
import { Popover } from "@/components/primitives";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/misc/command";

import type { ImportFieldDef } from "@/app/client-api/imports";
import { importFieldLabel } from "@/lib/imports/wizard-logic";

export type ChoiceCellEditorTarget = {
  sourceRow: number;
  field: string;
  value: string;
  rect: { x: number; y: number; width: number; height: number };
};

export function ChoiceCellEditor({
  target,
  fields,
  onPick,
  onClose,
}: {
  target: ChoiceCellEditorTarget | null;
  fields: ImportFieldDef[];
  onPick: (sourceRow: number, field: string, value: string) => void;
  onClose: () => void;
}) {
  if (!target) return null;

  const def = fields.find((f) => f.field_key === target.field);
  const choices = def?.choices ?? [];
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
        data-choice-cell-editor
        className="click-outside-ignore z-dropdown w-[280px] p-0"
      >
        <div className="border-b px-3 py-2 text-xs text-muted-foreground">
          {label}
        </div>
        <Command>
          <CommandInput placeholder="Search options…" />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {choices.map((choice) => (
                <CommandItem
                  key={choice.value}
                  value={`${choice.label} ${choice.value}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onSelect={() =>
                    onPick(target.sourceRow, target.field, choice.value)
                  }
                >
                  {choice.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <button
          type="button"
          className="w-full border-t px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(target.sourceRow, target.field, "")}
        >
          Clear value
        </button>
      </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
