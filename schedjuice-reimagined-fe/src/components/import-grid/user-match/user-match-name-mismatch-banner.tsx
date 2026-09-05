"use client";

import { matchFieldLabel } from "@/lib/imports/match-field-label";
import { cn } from "@/lib/utils";

type Props = {
  importedName?: string;
  matchedLabel?: string;
  matchField?: string | null;
  compact?: boolean;
  className?: string;
};

export function UserMatchNameMismatchBanner({
  importedName,
  matchedLabel,
  matchField,
  compact = false,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-md border border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-100",
        compact ? "mb-1.5 rounded border px-2 py-1 text-[11px]" : "mb-2 px-2 py-1.5 text-xs",
        className,
      )}
    >
      <p className="font-medium">
        Possible sibling — {compact ? "via" : "matched via"}{" "}
        {matchFieldLabel(matchField)}
      </p>
      {importedName ? (
        <p className={cn(compact ? "mt-0.5 truncate" : "mt-1 text-yellow-800/90 dark:text-yellow-100/90")}>
          Import: <span className="font-medium">{importedName}</span>
        </p>
      ) : null}
      {matchedLabel ? (
        <p className={cn(!compact && "text-yellow-800/90 dark:text-yellow-100/90", compact && "truncate")}>
          Matched: <span className="font-medium">{matchedLabel}</span>
        </p>
      ) : null}
    </div>
  );
}
