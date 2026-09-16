"use client";
import { Progress } from "@/components/misc/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/misc/collapsible";

import { WarningCircle as AlertCircle, NavArrowDown as ChevronDown, CenterAlign as Crosshair } from "iconoir-react";

import type { ImportFieldDef } from "@/app/client-api/imports";
import type { ImportValidationError } from "@/lib/imports/validation-errors";
import { importFieldLabel } from "@/lib/imports/wizard-logic";
import { cn } from "@/lib/utils";

import type { ImportGridFocusTarget } from "./import-data-grid";

function errorItemKey(err: ImportValidationError): string {
  return `${err.sourceRow}:${err.field}`;
}

export function ValidationErrorsPanel({
  errors,
  fields,
  initialCount,
  collapsed,
  focusTarget,
  onToggleCollapsed,
  onFocusError,
}: {
  errors: ImportValidationError[];
  fields: ImportFieldDef[];
  initialCount: number;
  collapsed: boolean;
  focusTarget?: ImportGridFocusTarget | null;
  onToggleCollapsed: () => void;
  onFocusError: (error: ImportValidationError) => void;
}) {
  const fixedCount = Math.max(0, initialCount - errors.length);
  const pct = initialCount ? (fixedCount / initialCount) * 100 : 100;

  if (errors.length === 0) return null;

  const focusedKey = focusTarget
    ? `${focusTarget.sourceRow}:${focusTarget.field}`
    : null;

  return (
    <Collapsible
      open={!collapsed}
      onOpenChange={(open) => {
        if (open === collapsed) onToggleCollapsed();
      }}
    >
      <div
        className={cn(
          "w-full overflow-hidden rounded-lg border border-border bg-background transition-shadow duration-300",
          !collapsed && "shadow-sm",
        )}
      >
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="group flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 active:scale-[0.99]"
              aria-label={
                collapsed
                  ? "Expand validation errors panel"
                  : "Collapse validation errors panel"
              }
            />
          }
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-50 dark:bg-red-950/40">
            <AlertCircle
              className="h-3.5 w-3.5 text-red-600 dark:text-red-400"
              aria-hidden
            />
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
            {errors.length} error{errors.length === 1 ? "" : "s"} to fix
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[panel-open]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border/60 bg-muted/20 px-3 py-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Click an item to jump to the cell, edit inline, then Import again.
            </p>
            <Progress value={pct} className="mt-2 h-1" />
          </div>

          <ul className="max-h-56 divide-y divide-border/60 overflow-y-auto p-2">
            {errors.map((err, i) => {
              const key = errorItemKey(err);
              const isFocused = focusedKey === key;

              return (
                <li key={`${key}-${i}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onFocusError(err)}
                    className={cn(
                      "group flex w-full items-start gap-2.5 rounded-md px-2.5 py-2.5 text-left transition-all",
                      "hover:bg-muted/50 active:scale-[0.99]",
                      isFocused
                        ? "bg-red-50/80 ring-1 ring-red-200/80 dark:bg-red-950/20 dark:ring-red-900/60"
                        : "bg-transparent",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums leading-none",
                        isFocused
                          ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {err.sourceRow + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {importFieldLabel(fields, err.field)}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {err.reason}
                      </span>
                    </span>
                    <Crosshair
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0 transition-opacity",
                        isFocused
                          ? "text-red-600 opacity-100 dark:text-red-400"
                          : "text-muted-foreground opacity-0 group-hover:opacity-100",
                      )}
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
