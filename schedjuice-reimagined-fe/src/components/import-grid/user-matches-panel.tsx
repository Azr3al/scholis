"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { DoubleCheck as CheckCheck, MouseButtonLeft as MousePointerClick, UserBadgeCheck as UserCheck } from "iconoir-react";

import { cn } from "@/lib/utils";

export function UserMatchesPanel({
  pendingExactCount,
  pendingFuzzyCount,
  pendingNameMismatchCount = 0,
  unmatchedCount = 0,
  onConfirmAllExact,
  className,
}: {
  pendingExactCount: number;
  pendingFuzzyCount: number;
  pendingNameMismatchCount?: number;
  unmatchedCount?: number;
  onConfirmAllExact: () => void;
  className?: string;
}) {
  if (
    pendingExactCount === 0 &&
    pendingFuzzyCount === 0 &&
    pendingNameMismatchCount === 0 &&
    unmatchedCount === 0
  ) {
    return null;
  }

  const totalPending =
    pendingExactCount + pendingFuzzyCount + pendingNameMismatchCount + unmatchedCount;

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/60 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/40">
          <UserCheck
            className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300"
            aria-hidden
          />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium text-emerald-950 dark:text-emerald-100">
          {totalPending} user match{totalPending === 1 ? "" : "es"} pending
        </span>
      </div>

      <div className="space-y-3 border-t border-emerald-200/70 p-3 dark:border-emerald-900/50">
        {pendingExactCount > 0 ? (
          <div className="space-y-2">
            <Button
              type="button"
              size="sm"
              onClick={onConfirmAllExact}
              className="w-full gap-2 bg-emerald-600 text-white shadow-sm transition-transform hover:bg-emerald-600/90 active:scale-[0.98] dark:bg-emerald-600 dark:hover:bg-emerald-600/90"
            >
              <CheckCheck className="h-4 w-4" aria-hidden />
              Confirm all exact matches ({pendingExactCount})
            </Button>
            <p className="text-xs text-emerald-900/70 dark:text-emerald-200/70">
              These rows matched an existing user on an exact email or phone
              value. Confirming links them in one step.
            </p>
          </div>
        ) : null}

        {pendingNameMismatchCount > 0 ? (
          <p className="text-xs text-amber-800 dark:text-amber-200/90">
            {pendingNameMismatchCount} possible sibling match
            {pendingNameMismatchCount === 1 ? "" : "es"} need review — names differ
            from the matched user. Click the yellow email cell to confirm or create
            new.
          </p>
        ) : null}

        {pendingFuzzyCount > 0 ? (
          <div
            className={cn(
              "flex items-start gap-2 text-xs text-emerald-900/80 dark:text-emerald-200/80",
              pendingExactCount > 0 &&
                "border-t border-emerald-200/70 pt-3 dark:border-emerald-900/50",
            )}
          >
            <MousePointerClick
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300"
              aria-hidden
            />
            <span>
              <span className="font-medium">
                {pendingFuzzyCount} likely match{pendingFuzzyCount === 1 ? "" : "es"}
              </span>{" "}
              need review — click a highlighted email cell in the grid to pick the
              right user.
            </span>
          </div>
        ) : null}

        {unmatchedCount > 0 ? (
          <div
            className={cn(
              "flex items-start gap-2 text-xs text-emerald-900/80 dark:text-emerald-200/80",
              (pendingExactCount > 0 || pendingFuzzyCount > 0 || pendingNameMismatchCount > 0) &&
                "border-t border-emerald-200/70 pt-3 dark:border-emerald-900/50",
            )}
          >
            <MousePointerClick
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300"
              aria-hidden
            />
            <span>
              <span className="font-medium">
                {unmatchedCount} unmatched row{unmatchedCount === 1 ? "" : "s"}
              </span>{" "}
              — click the dashed name or email cell to pick a roster student or
              ignore the row.
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
