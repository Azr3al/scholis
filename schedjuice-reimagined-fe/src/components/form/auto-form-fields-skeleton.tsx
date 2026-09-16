"use client";

import { Controller } from "react-hook-form";

import { AutoFormSkeleton } from "@/components/auto-form";
import type { AutoFormGroup, AutoFormSaveMode } from "@/components/auto-form";

/**
 * Bridge skeleton for callers still using flat `rows`.
 * Prefer `AutoFormSkeleton` from `@/components/auto-form` with explicit `groups` (F1/F2).
 */
export function AutoFormFieldsSkeleton({
  rows = 8,
  className,
  groups,
  saveMode = "create",
}: {
  rows?: number;
  className?: string;
  /** When provided, mirrors real group layout instead of a flat Details stack. */
  groups?: AutoFormGroup[];
  saveMode?: AutoFormSaveMode;
}) {
  const resolvedGroups: AutoFormGroup[] =
    groups ??
    [
      {
        id: "details",
        title: "Details",
        fields: Array.from({ length: rows }, (_, i) => `field_${i}`),
      },
    ];

  return (
    <AutoFormSkeleton
      groups={resolvedGroups}
      className={className}
      saveMode={saveMode}
    />
  );
}
