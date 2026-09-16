"use client";

import { useMemo } from "react";

import { Button, Checkbox } from "@/components/primitives";
import {
  groupSessionsByMonth,
  type SessionOption,
} from "@/helpers/course/session-grouping";
import {
  formatOrgTimeRange,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";
import { cn } from "@/lib/utils";

export type SessionDateGridProps = {
  sessions: SessionOption[];
  selectedIds: Set<number>;
  onToggleSession: (sessionId: number) => void;
  onToggleMonth: (monthKey: string, nextSelected: boolean) => void;
  timeFormat: TimeDisplayFormatValue;
};

export function SessionDateGrid({
  sessions,
  selectedIds,
  onToggleSession,
  onToggleMonth,
  timeFormat,
}: SessionDateGridProps) {
  const groups = useMemo(() => groupSessionsByMonth(sessions), [sessions]);

  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
        This course has no sessions yet. Add sessions before assigning a teacher.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const selectedCount = group.sessions.filter((s) =>
          selectedIds.has(s.id),
        ).length;
        const allSelected = selectedCount === group.sessions.length;
        return (
          <section key={group.key} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="space-y-0.5">
                <h4 className="font-serif text-base text-text-primary">
                  {group.label}
                </h4>
                <p className="text-xs text-text-muted">
                  {selectedCount} of {group.sessions.length} selected
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`${allSelected ? "Deselect" : "Select"} all sessions in ${group.label}`}
                onClick={() => onToggleMonth(group.key, !allSelected)}
              >
                {allSelected ? "Deselect all" : "Select all"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {group.sessions.map((session) => {
                const isSelected = selectedIds.has(session.id);
                return (
                  <label
                    key={session.id}
                    className={cn(
                      "flex min-h-[52px] cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors",
                      isSelected
                        ? "border-[var(--action,var(--data-green-strong))] bg-accent"
                        : "border-border bg-surface hover:bg-accent/40",
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSession(session.id)}
                      aria-label={session.dayLabel}
                      className="mt-0.5"
                    />
                    <span className="space-y-0.5">
                      <span className="block text-sm text-text-primary">
                        {session.dayLabel}
                      </span>
                      <span className="block text-xs text-text-muted">
                        {formatOrgTimeRange(
                          session.timeFrom,
                          session.timeTo,
                          timeFormat,
                        )}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
