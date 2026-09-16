"use client";

import { WeekdayAnimalIcon } from "@/components/icons/weekday-animal-icons";
import { Button } from "@/components/primitives";
import { cn } from "@/lib/utils";

export type WeekdayToggleRowProps = {
  days: readonly string[];
  selected: string[];
  onToggle: (day: string) => void;
  disabled?: boolean;
  className?: string;
};

export function WeekdayToggleRow({
  days,
  selected,
  onToggle,
  disabled = false,
  className,
}: WeekdayToggleRowProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {days.map((day) => {
        const isSelected = selected.includes(day);
        return (
          <Button
            key={day}
            type="button"
            size="sm"
            variant={isSelected ? "primary" : "secondary"}
            aria-pressed={isSelected}
            className="gap-1.5"
            disabled={disabled}
            onClick={() => onToggle(day)}
          >
            <WeekdayAnimalIcon day={day} className="size-4.5 shrink-0" />
            {day}
          </Button>
        );
      })}
    </div>
  );
}
