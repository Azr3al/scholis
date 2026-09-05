"use client";

import { memo } from "react";

import { Input } from "@/components/primitives";
import {
  COLUMN_MAP_ROLE_LABELS,
  isValidColumnMapRole,
  type ColumnMapRole,
} from "@/lib/mark-sheets/column-map-role";
import { cn } from "@/lib/utils";

type Props = {
  header: string;
  role: ColumnMapRole;
  maxMarks?: number;
  onRoleChange: (role: ColumnMapRole) => void;
  onMaxMarksChange?: (value: number | null) => void;
};

const ROLE_ITEMS = (Object.keys(COLUMN_MAP_ROLE_LABELS) as ColumnMapRole[]).map(
  (role) => ({
    value: role,
    label: COLUMN_MAP_ROLE_LABELS[role],
  }),
);

/**
 * Native select avoids Base UI's hidden autofill input, which can throw when
 * many column dropdowns mount at once after parse (undefined.value.toLowerCase).
 */
export const MarkSheetColumnMapSelect = memo(function MarkSheetColumnMapSelect({
  header,
  role,
  maxMarks,
  onRoleChange,
  onMaxMarksChange,
}: Props) {
  const safeRole = isValidColumnMapRole(role) ? role : "ignore";

  return (
    <div className="min-w-0 space-y-1 px-1">
      <div className="truncate text-xs font-medium" title={header || "(blank)"}>
        {header || "(blank)"}
      </div>
      <select
        aria-label={`Column role for ${header || "blank column"}`}
        autoComplete="off"
        value={safeRole}
        onChange={(e) => {
          const next = e.target.value;
          if (isValidColumnMapRole(next)) onRoleChange(next);
        }}
        className={cn(
          "h-8 w-full min-w-0 rounded-md border border-border bg-surface px-2 text-sm text-text-primary",
          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1",
        )}
      >
        {ROLE_ITEMS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {safeRole === "score" && onMaxMarksChange ? (
        <Input
          type="number"
          min={1}
          placeholder="Max"
          className="h-7 text-xs"
          value={maxMarks ?? ""}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onMaxMarksChange(raw ? Number(raw) : null);
          }}
        />
      ) : null}
    </div>
  );
});

export default MarkSheetColumnMapSelect;
