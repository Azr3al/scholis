"use client";

import { NavArrowDown as ChevronDown, Plus } from "iconoir-react";
import { motion, useReducedMotion } from "motion/react";
import { Fragment, useMemo, useState } from "react";

import { BulkAddMicrosoftLink } from "@/components/microsoft/bulk-add-microsoft-link";
import { FormSaveTick } from "@/components/product-docs/form-save-tick";
import { Button } from "@/components/primitives";
import { Textarea } from "@/components/primitives";
import { useBulkStudentEmailResolve } from "@/hooks/use-bulk-student-email-resolve";
import {
  BULK_STUDENT_STATUS_LABEL,
  type BulkStudentRowStatus,
} from "@/lib/course/bulk-student-email-resolve";
import {
  crossfadeInstant,
  staggerItemOpacity,
  staggerRowDelay,
} from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import { accountType } from "@/types/user";

const TICK_MS = 2000;

const MotionTableRow = motion.tr;

const STATUS_CLASS: Record<BulkStudentRowStatus, string> = {
  ready: "text-success",
  needs_ms_link: "text-amber-700 dark:text-amber-400",
  not_found: "text-destructive",
  already_on_roster: "text-muted-foreground",
  duplicate: "text-muted-foreground",
};

function buildSummaryLine(summary: {
  ready: number;
  needsMsLink: number;
  notFound: number;
  alreadyOnRoster: number;
  duplicate: number;
}): string {
  const parts: string[] = [];
  if (summary.ready > 0) {
    parts.push(`${summary.ready} ready`);
  }
  if (summary.needsMsLink > 0) {
    parts.push(`${summary.needsMsLink} need link`);
  }
  if (summary.notFound > 0) {
    parts.push(`${summary.notFound} not found`);
  }
  if (summary.alreadyOnRoster > 0) {
    parts.push(`${summary.alreadyOnRoster} already on roster`);
  }
  if (summary.duplicate > 0) {
    parts.push(`${summary.duplicate} duplicate`);
  }
  return parts.join(" · ");
}

type CourseStudentPastePanelProps = {
  rosterEmails: Set<string>;
  requiresMsLink: boolean;
  canLinkMicrosoft: boolean;
  disabled?: boolean;
  onAdd: (userIds: number[]) => Promise<void>;
  className?: string;
};

export function CourseStudentPastePanel({
  rosterEmails,
  requiresMsLink,
  canLinkMicrosoft,
  disabled = false,
  onAdd,
  className,
}: CourseStudentPastePanelProps) {
  const reducedMotion = useReducedMotion();
  const rowVariants = reducedMotion ? crossfadeInstant : staggerItemOpacity;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [showTick, setShowTick] = useState(false);
  const [tickLabel, setTickLabel] = useState("Added");
  const [submitting, setSubmitting] = useState(false);

  const { rows, summary, isSearching, searchError, markMicrosoftLinked } =
    useBulkStudentEmailResolve({
      pastedText: text,
      rosterEmails,
      requiresMsLink,
      enabled: open,
    });

  const summaryLine = useMemo(() => buildSummaryLine(summary), [summary]);
  const canAdd =
    summary.ready > 0 && !disabled && !submitting && !isSearching;

  async function handleAdd() {
    if (!canAdd) return;
    const userIds = summary.readyUsers.map((user) => user.id);
    setSubmitting(true);
    try {
      await onAdd(userIds);
      setText("");
      setOpen(false);
      setTickLabel(`Added ${userIds.length}`);
      setShowTick(true);
      window.setTimeout(() => setShowTick(false), TICK_MS);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={cn("flex w-full min-w-0 flex-wrap items-center gap-3", className)}>
      <div className="w-full min-w-0 rounded-lg border">
          <button
            type="button"
            disabled={disabled}
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className="flex items-center gap-2">
              <Plus className="size-4 shrink-0" aria-hidden />
              Paste emails from Excel
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        {open ? (
          <div className="space-y-3 border-t px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Paste one email per line, or copy a single column from Excel or
              Google Sheets.
            </p>

            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={disabled || submitting}
              placeholder={"alice@school.com\nbob@school.com"}
              className="min-h-[100px] font-mono text-xs"
              aria-label="Paste student emails"
            />

            {rows.length > 0 ? (
              <div className="space-y-2">
                <p
                  className="text-sm text-muted-foreground"
                  aria-live="polite"
                >
                  Preview — {rows.length} email
                  {rows.length === 1 ? "" : "s"}
                  {isSearching ? " (looking up…)" : ""}
                </p>
                <div className="max-h-[240px] overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="h-10 w-10 shrink-0 px-2 text-left align-middle text-xs font-medium text-muted-foreground">#</th>
                        <th className="h-10 min-w-[140px] px-2 text-left align-middle text-xs font-medium text-muted-foreground">
                          Email
                        </th>
                        <th className="h-10 min-w-[120px] px-2 text-left align-middle text-xs font-medium text-muted-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, rowIndex) => (
                        <Fragment key={`${row.email}-${row.index}`}>
                          <MotionTableRow
                            variants={rowVariants}
                            initial="hidden"
                            animate="show"
                            style={
                              reducedMotion
                                ? undefined
                                : {
                                    transitionDelay: `${staggerRowDelay(rowIndex)}s`,
                                  }
                            }
                          >
                            <td className="p-2 align-middle text-xs text-muted-foreground">
                              {rowIndex + 1}
                            </td>
                            <td
                              className="max-w-[200px] truncate p-2 align-middle font-mono text-xs"
                              title={row.email}
                            >
                              {row.email}
                            </td>
                            <td
                              className={cn(
                                "p-2 align-middle text-xs font-medium",
                                STATUS_CLASS[row.status],
                              )}
                            >
                              {BULK_STUDENT_STATUS_LABEL[row.status]}
                            </td>
                          </MotionTableRow>
                          {row.status === "needs_ms_link" &&
                          row.user &&
                          requiresMsLink &&
                          canLinkMicrosoft ? (
                            <tr>
                              <td colSpan={3} className="p-2 pb-3 pt-0 align-middle">
                                <BulkAddMicrosoftLink
                                  user={row.user as accountType}
                                  onLinked={(userId, microsoftId) =>
                                    markMicrosoftLinked(userId, microsoftId)
                                  }
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : text.trim().length > 0 ? (
              <p className="text-sm text-muted-foreground">
                Paste one email per line.
              </p>
            ) : null}

            {summaryLine ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {summaryLine}
              </p>
            ) : null}

            {searchError ? (
              <p className="text-sm text-destructive" role="alert">
                Could not look up students. Try again.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                size="sm"
                disabled={!canAdd}
                isLoading={submitting}
                onClick={() => void handleAdd()}
              >
                Add {summary.ready > 0 ? summary.ready : ""} student
                {summary.ready === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <FormSaveTick visible={showTick} label={tickLabel} />
    </div>
  );
}
