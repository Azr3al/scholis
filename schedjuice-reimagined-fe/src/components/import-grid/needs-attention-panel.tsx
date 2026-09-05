"use client";
import { Button, buttonVariants } from "@/components/primitives";
import { Progress } from "@/components/misc/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/misc/collapsible";

import { WarningTriangle as AlertTriangle, NavArrowDown as ChevronDown } from "iconoir-react";

import type {
  CourseConflict,
  UnresolvedTokenGroup,
} from "@/lib/imports/resolution";
import { cn } from "@/lib/utils";

export function NeedsAttentionPanel({
  groups,
  conflicts,
  progress,
  collapsed,
  onToggleCollapsed,
  onResolve,
}: {
  groups: UnresolvedTokenGroup[];
  conflicts: CourseConflict[];
  progress: { resolved: number; total: number };
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onResolve: (
    group: UnresolvedTokenGroup,
    rect: { x: number; y: number; width: number; height: number },
  ) => void;
}) {
  const pct = progress.total ? (progress.resolved / progress.total) * 100 : 100;

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
                  ? "Expand course resolution panel"
                  : "Collapse course resolution panel"
              }
            />
          }
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-50 dark:bg-amber-950/40">
            <AlertTriangle
              className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
            {progress.resolved} of {progress.total} courses resolved
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[panel-open]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-3 border-t border-border/60 p-3">
            <Progress value={pct} className="h-1.5" />

            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All course values resolved.
              </p>
            ) : (
              <ul className="space-y-1">
                {groups.map((g) => (
                  <li key={g.raw}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-between"
                      onClick={(e) => {
                        const r = (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect();
                        onResolve(g, {
                          x: r.left,
                          y: r.top,
                          width: r.width,
                          height: r.height,
                        });
                      }}
                    >
                      <span className="truncate text-amber-800 dark:text-amber-200">
                        {g.raw}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        × {g.count}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {conflicts.length > 0 && (
              <div className="space-y-1 border-t border-border/60 pt-2">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  Conflicts
                </p>
                {conflicts.map((c) => (
                  <p
                    key={c.raw}
                    className="flex items-start gap-1.5 text-xs text-muted-foreground"
                  >
                    <AlertTriangle
                      className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400"
                      aria-hidden
                    />
                    <span>
                      &ldquo;{c.raw}&rdquo; linked to {c.titles.length}{" "}
                      different courses
                    </span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
