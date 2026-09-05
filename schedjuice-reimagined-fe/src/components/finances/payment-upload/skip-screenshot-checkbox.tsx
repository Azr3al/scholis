"use client";

import { Checkbox, Field } from "@/components/primitives";

type SkipScreenshotCheckboxProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function SkipScreenshotCheckbox({
  id,
  checked,
  onCheckedChange,
  disabled = false,
}: SkipScreenshotCheckboxProps) {
  return (
    <Field.Root className="flex flex-row items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(Boolean(value))}
      />
      <Field.Label htmlFor={id}>Skip screenshot upload</Field.Label>
    </Field.Root>
  );
}
