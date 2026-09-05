"use client";
import { Button, Radio, RadioGroup, buttonVariants } from "@/components/primitives";

import { useState } from "react";
import { NavArrowDown as ChevronDown, NavArrowUp as ChevronUp } from "iconoir-react";

import type {
  DuplicateEmailResolution,
  DuplicateEmailStrategy,
} from "@/lib/imports/resolution";
import { cn } from "@/lib/utils";

const STRATEGY_OPTIONS: {
  value: DuplicateEmailStrategy;
  label: string;
  description: string;
}[] = [
  {
    value: "keep_first",
    label: "Keep first row",
    description: "Use the earliest row for each duplicate email; skip later rows.",
  },
  {
    value: "keep_last",
    label: "Keep last row",
    description: "Use the last row in the file for each duplicate email.",
  },
  {
    value: "merge",
    label: "Combine rows",
    description:
      "Merge duplicate rows into one: union course enrollments and fill empty fields from other rows.",
  },
];

export function DuplicateEmailsPanel({
  resolution,
  strategy,
  onStrategyChange,
}: {
  resolution: DuplicateEmailResolution;
  strategy: DuplicateEmailStrategy;
  onStrategyChange: (strategy: DuplicateEmailStrategy) => void;
}) {
  const [listExpanded, setListExpanded] = useState(true);
  const duplicateEmailCount = resolution.duplicateGroups.size;
  const skippedRowCount = resolution.skippedRowIndices.size;

  if (duplicateEmailCount === 0) return null;

  const groups = Array.from(resolution.duplicateGroups.entries()).sort(
    ([a], [b]) => a.localeCompare(b),
  );

  return (
    <section
      className="space-y-4 rounded-md border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20"
      aria-labelledby="duplicate-emails-heading"
    >
      <div className="space-y-1">
        <h2 id="duplicate-emails-heading" className="text-sm font-medium">
          Duplicate emails in file
        </h2>
        <p className="text-sm text-muted-foreground">
          {duplicateEmailCount} duplicate email
          {duplicateEmailCount === 1 ? "" : "s"} · {skippedRowCount} row
          {skippedRowCount === 1 ? "" : "s"} will be skipped
        </p>
      </div>

      <fieldset className="m-0 space-y-3 border-0 p-0">
        <legend className="text-sm font-medium">How to handle duplicates</legend>
        <RadioGroup
          value={strategy}
          onValueChange={(v) => {
            if (
              v === "keep_first" ||
              v === "keep_last" ||
              v === "merge"
            ) {
              onStrategyChange(v);
            }
          }}
          className="grid gap-2 sm:grid-cols-3"
        >
          {STRATEGY_OPTIONS.map((opt) => {
            const inputId = `duplicate-strategy-${opt.value}`;
            const selected = strategy === opt.value;
            return (
              <label
                key={opt.value}
                htmlFor={inputId}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-background hover:bg-muted/40",
                )}
              >
                <div className="flex items-start gap-2">
                  <Radio
                    value={opt.value}
                    id={inputId}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <span className="text-sm font-medium">{opt.label}</span>
                    <p className="text-xs text-muted-foreground">
                      {opt.description}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </RadioGroup>
      </fieldset>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Duplicate groups
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setListExpanded((v) => !v)}
          >
            {listExpanded ? (
              <>
                Hide
                <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                Show
                <ChevronDown className="h-3 w-3" />
              </>
            )}
          </Button>
        </div>
        {listExpanded ? (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {groups.map(([email, indices]) => {
              const sorted = [...indices].sort((a, b) => a - b);
              const kept = resolution.keptRowByEmail.get(email) ?? sorted[0];
              const rowLabel = sorted.map((i) => i + 1).join(", ");
              return (
                <li
                  key={email}
                  className="rounded-md border border-border/60 bg-background/80 px-3 py-2"
                >
                  <span className="font-medium">{email}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · rows {rowLabel} · keeping row {kept + 1}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
