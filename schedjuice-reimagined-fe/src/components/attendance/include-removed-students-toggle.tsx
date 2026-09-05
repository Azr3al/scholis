"use client";

import { Switch } from "@/components/primitives/switch";
import { cn } from "@/lib/utils";

export function IncludeRemovedStudentsToggle({
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-sm text-text-secondary",
        className,
      )}
    >
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      <span>Include removed students</span>
    </label>
  );
}
