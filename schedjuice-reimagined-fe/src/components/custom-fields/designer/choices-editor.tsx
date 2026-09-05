"use client";
import { Button, Input, buttonVariants, inputClassName } from "@/components/primitives";

import type { ChoiceRow } from "@/lib/custom-fields/definition-defaults";
import { Plus, Trash as Trash2 } from "iconoir-react";

export function ChoicesEditor({
  value,
  onChange,
}: {
  value: ChoiceRow[];
  onChange: (next: ChoiceRow[]) => void;
}) {
  const update = (i: number, patch: Partial<ChoiceRow>) =>
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, { value: "", label: "" }]);

  return (
    <div className="space-y-2">
      <label>Choices</label>
      <div className="flex flex-col gap-2">
        {value.map((row, i) => (
          <div
            key={i}
            className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 bg-muted/20 p-2"
          >
            <div className="grid min-w-[140px] flex-1 gap-1">
              <span className="text-muted-foreground text-xs">Stored value</span>
              <Input
                value={row.value}
                placeholder="e.g. east"
                onChange={(e) => update(i, { value: e.target.value })}
              />
            </div>
            <div className="grid min-w-[140px] flex-1 gap-1">
              <span className="text-muted-foreground text-xs">Shown label</span>
              <Input
                value={row.label}
                placeholder="e.g. East wing"
                onChange={(e) => update(i, { label: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm" className="shrink-0"
              aria-label="Remove option"
              onClick={() => remove(i)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary" size="sm"
          className="w-fit"
          onClick={add}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add option
        </Button>
      </div>
    </div>
  );
}
