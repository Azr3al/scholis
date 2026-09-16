"use client";

import { Textarea } from "@/components/primitives";
import { useEffect, useState } from "react";

export function CheckinCorrectionTodayActivitiesField({
  rowKey,
  initialValue,
  disabled,
  onValueChange,
}: {
  rowKey: string;
  initialValue: string;
  disabled?: boolean;
  onValueChange: (rowKey: string, value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue, rowKey]);

  return (
    <Textarea
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        onValueChange(rowKey, next);
      }}
      placeholder="What did you cover in this session?"
      rows={2}
      disabled={disabled}
      className="min-h-[4.5rem] max-w-xs resize-y"
    />
  );
}
