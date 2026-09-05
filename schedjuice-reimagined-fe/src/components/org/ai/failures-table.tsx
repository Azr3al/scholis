"use client";
import { Button, useToast } from "@/components/primitives";

import { resolveOrgAiUsageFailure } from "@/app/client-api/ai-usage";
import { CapabilityGapBadges } from "@/components/org/ai/capability-gap-badges";
import { FailureCauseBadges } from "@/components/org/ai/failure-cause-badges";
import { FailureOutcomeBadge } from "@/components/org/ai/failure-outcome-badge";
import { FailuresDiagnosisCell } from "@/components/org/ai/failures-diagnosis-cell";
import { ThinkingStepsBlock } from "@/components/org/ai/thinking-steps-block";
import { formatAiFailureMarkdown } from "@/lib/ai/format-failure-markdown";
import { cn } from "@/lib/utils";
import {
  AiUsageFailureItem,
  FailuresOutcomeFilter,
  FailuresResolutionFilter,
  FailuresSort,
  formatAiTokens,
} from "@/types/ai-usage";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NavArrowDown as ChevronDown, NavArrowRight as ChevronRight, Copy, Check as CopyCheck } from "iconoir-react";
import Link from "next/link";
import { Fragment, useRef, useState } from "react";

function truncatePrompt(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function SortableHeader({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={className}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 text-left font-medium hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={onClick}
      >
        {label}
      </button>
    </th>
  );
}

function FailureCopyButton({ item }: { item: AiUsageFailureItem }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  function handleCopy(event: React.MouseEvent) {
    event.stopPropagation();
    void navigator.clipboard.writeText(formatAiFailureMarkdown(item)).then(() => {
      setCopied(true);
      toast.add({ description: "Copied failure details" });
      setTimeout(() => setCopied(false), 1000);
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="size-8 shrink-0 p-0"
      aria-label="Copy failure details as Markdown"
      onClick={handleCopy}
    >
      {copied ? (
        <CopyCheck className="size-4" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
    </Button>
  );
}

function FailureResolveButton({
  orgId,
  item,
  resolutionFilter,
}: {
  orgId: number | string;
  item: AiUsageFailureItem;
  resolutionFilter: FailuresResolutionFilter;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isResolved = Boolean(item.resolved_at);
  const showResolve = !isResolved && resolutionFilter !== "resolved";
  const showUnresolve = isResolved && resolutionFilter !== "open";

  const mutation = useMutation({
    mutationFn: (resolved: boolean) =>
      resolveOrgAiUsageFailure(orgId, item.id, resolved),
    onSuccess: (_data, resolved) => {
      void queryClient.invalidateQueries({ queryKey: ["aiUsageOrgFailures", orgId] });
      toast.add({
        description: resolved ? "Failure marked as resolved" : "Failure reopened"});
    },
    onError: () => {
      toast.add({
        description: "Could not update failure status."});
    },
  });

  if (!showResolve && !showUnresolve) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 shrink-0 px-2 text-xs"
      disabled={mutation.isPending}
      onClick={(event) => {
        event.stopPropagation();
        mutation.mutate(showUnresolve ? false : true);
      }}
    >
      {showUnresolve ? "Unresolve" : "Resolve"}
    </Button>
  );
}

function emptyMessage(
  outcomeFilter: FailuresOutcomeFilter,
  resolutionFilter: FailuresResolutionFilter,
): string {
  if (resolutionFilter === "resolved") {
    return "No resolved failures this month.";
  }
  if (outcomeFilter === "capability_gap") {
    return "No capability gap failures this month.";
  }
  if (outcomeFilter === "all") {
    return "No AI failures this month.";
  }
  return "No tool limit failures this month.";
}

export function FailuresTable({
  items,
  showOrgColumn,
  dateParam,
  page,
  pageSize,
  totalCount,
  onPageChange,
  sort = "-created_at",
  onSortChange,
  outcomeFilter = "tool_limit_exceeded",
  resolutionFilter = "open",
  orgId,
}: {
  items: AiUsageFailureItem[];
  showOrgColumn: boolean;
  dateParam: string;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  sort?: FailuresSort;
  onSortChange?: (sort: FailuresSort) => void;
  outcomeFilter?: FailuresOutcomeFilter;
  resolutionFilter?: FailuresResolutionFilter;
  orgId?: number | string;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function toggleExpanded(id: number) {
    setExpandedId((prev) => {
      const next = prev === id ? null : id;
      if (next !== null) {
        tableContainerRef.current
          ?.querySelector('[data-slot="table-container"]')
          ?.scrollTo({ left: 0 });
      }
      return next;
    });
  }
  const showOutcomeColumn = outcomeFilter === "all";
  const isCapabilityGapView = outcomeFilter === "capability_gap";
  const showIterations = !isCapabilityGapView;
  const diagnosisLabel = isCapabilityGapView ? "Gap type" : "Likely cause";
  const colCount =
    (showOrgColumn ? 1 : 0) +
    5 +
    (showOutcomeColumn ? 1 : 0) +
    (isCapabilityGapView ? 1 : 0) +
    (showIterations ? 1 : 0) +
    1 +
    2;

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {emptyMessage(outcomeFilter, resolutionFilter)}
      </p>
    );
  }

  return (
    <div className="min-w-0 w-full space-y-4">
      <div ref={tableContainerRef}>
        <table className="table-fixed w-full">
          <colgroup>
            <col className="w-8" />
            <col className="w-[11rem]" />
            {showOutcomeColumn ? <col className="w-[6.5rem]" /> : null}
            {showOrgColumn ? <col className="w-[10rem]" /> : null}
            <col className="w-[8rem]" />
            <col />
            {isCapabilityGapView ? <col className="w-[14rem]" /> : null}
            <col className="w-[10rem]" />
            <col className="w-[8rem]" />
            {showIterations ? <col className="w-[5rem]" /> : null}
            <col className="w-[5.5rem]" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr>
            <th className="w-8" />
            <SortableHeader
              label="When"
              active={sort === "created_at" || sort === "-created_at"}
              onClick={() =>
                onSortChange?.(sort === "-created_at" ? "created_at" : "-created_at")
              }
            />
            {showOutcomeColumn ? <th>Outcome</th> : null}
            {showOrgColumn ? <th>Organization</th> : null}
            <th>User</th>
            <th>Question</th>
            {isCapabilityGapView ? <th>Intent</th> : null}
            <th>Tools</th>
            <th>{outcomeFilter === "all" ? "Diagnosis" : diagnosisLabel}</th>
            {showIterations ? (
              <SortableHeader
                label="Iterations"
                active={sort === "tool_iterations" || sort === "-tool_iterations"}
                onClick={() =>
                  onSortChange?.(
                    sort === "-tool_iterations" ? "tool_iterations" : "-tool_iterations",
                  )
                }
                className="text-right"
              />
            ) : null}
            <th className="text-right">Tokens</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const expanded = expandedId === item.id;
            const isHistorical =
              item.source === "backfill" && item.tool_calls.length === 0;
            const isCapabilityGap = item.outcome === "capability_gap";
            return (
              <Fragment key={item.id}>
                <tr
                  className="cursor-pointer"
                  onClick={() => toggleExpanded(item.id)}
                >
                  <td>
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    <div className="flex flex-col gap-1">
                      <span>{formatWhen(item.created_at)}</span>
                      {item.resolved_at && resolutionFilter === "all" ? (
                        <span className="inline-flex items-center rounded-md border border-border bg-transparent px-2 py-0.5 text-xs font-medium text-text-secondary w-fit text-xs font-normal">
                          Resolved
                        </span>
                      ) : null}
                    </div>
                  </td>
                  {showOutcomeColumn ? (
                    <td>
                      <FailureOutcomeBadge outcome={item.outcome} />
                    </td>
                  ) : null}
                  {showOrgColumn ? (
                    <td>
                      <Link
                        href={`/internal/organizations/${item.organization_id}?section=ai&pane=failures&date=${encodeURIComponent(dateParam)}`}
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.organization_name}
                      </Link>
                    </td>
                  ) : null}
                  <td className="max-w-[8rem] min-w-0 truncate text-sm">
                    {item.user_display_name}
                  </td>
                  <td
                    className="max-w-0 min-w-0 truncate text-sm"
                    title={item.prompt}
                  >
                    {truncatePrompt(item.prompt)}
                  </td>
                  {isCapabilityGapView ? (
                    <td
                      className="max-w-[14rem] min-w-0 whitespace-normal text-sm text-muted-foreground line-clamp-2"
                      title={item.capability_gap_intent || undefined}
                    >
                      {item.capability_gap_intent || "—"}
                    </td>
                  ) : null}
                  <td className="max-w-[10rem] min-w-0 whitespace-normal">
                    {isHistorical ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : item.tool_calls.length === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {item.tool_calls.map((tc, index) => (
                          <span
                            key={`${tc.name}-${index}`}
                            className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary text-xs"
                          >
                            {tc.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <FailuresDiagnosisCell item={item} />
                  </td>
                  {showIterations ? (
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {isCapabilityGap && outcomeFilter === "all"
                        ? "—"
                        : item.tool_iterations}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {formatAiTokens(item.total_tokens)}
                  </td>
                  <td className="p-1">
                    <div className="flex items-center justify-end gap-0.5">
                      {orgId != null ? (
                        <FailureResolveButton
                          orgId={orgId}
                          item={item}
                          resolutionFilter={resolutionFilter}
                        />
                      ) : null}
                      <FailureCopyButton item={item} />
                    </div>
                  </td>
                </tr>
                {expanded ? (
                  <tr>
                    <td
                      colSpan={colCount + 1}
                      className="bg-muted/30 p-0 whitespace-normal"
                    >
                      <div className="space-y-3 break-words p-4 text-sm">
                        {item.resolved_at ? (
                          <p>
                            <span className="font-medium text-muted-foreground">
                              Resolved:{" "}
                            </span>
                            {formatWhen(item.resolved_at)}
                            {item.resolved_by_display_name
                              ? ` by ${item.resolved_by_display_name}`
                              : ""}
                          </p>
                        ) : null}
                        {isCapabilityGap ? (
                          <div className="rounded-md border border-border bg-background p-3 space-y-1">
                            <p>
                              <span className="font-medium text-muted-foreground">
                                Why flagged:{" "}
                              </span>
                              {item.capability_gap_reason || "—"}
                            </p>
                            <p>
                              <span className="font-medium text-muted-foreground">
                                Intent:{" "}
                              </span>
                              {item.capability_gap_intent || "—"}
                            </p>
                            <p>
                              <span className="font-medium text-muted-foreground">
                                Suggested fix:{" "}
                              </span>
                              {item.capability_gap_suggested_surface || "—"}
                            </p>
                            <p>
                              <span className="font-medium text-muted-foreground">
                                Domain:{" "}
                              </span>
                              {item.capability_gap_domain || "—"}
                            </p>
                            <CapabilityGapBadges gaps={item.capability_gaps} />
                          </div>
                        ) : (
                          <FailureCauseBadges causes={item.likely_causes} />
                        )}
                        <div>
                          <p className="mb-1 font-medium text-muted-foreground">
                            Reasoning
                          </p>
                          <ThinkingStepsBlock
                            steps={item.thinking_steps}
                            toolIterations={item.tool_iterations}
                          />
                        </div>
                        {isHistorical && !item.likely_causes.includes("unknown") ? (
                          <span className="inline-flex items-center rounded-md border border-border bg-transparent px-2 py-0.5 text-xs font-medium text-text-secondary">Historical (no tool detail)</span>
                        ) : null}
                        <div>
                          <p className="mb-1 font-medium text-muted-foreground">
                            Full question
                          </p>
                          <p className="whitespace-pre-wrap">{item.prompt}</p>
                        </div>
                        {item.response_text ? (
                          <div>
                            <p className="mb-1 font-medium text-muted-foreground">
                              Response
                            </p>
                            <p className="whitespace-pre-wrap">{item.response_text}</p>
                          </div>
                        ) : null}
                        {item.tool_calls.length > 0 ? (
                          <div>
                            <p className="mb-1 font-medium text-muted-foreground">
                              Tool calls
                            </p>
                            <pre
                              className={cn(
                                "overflow-x-auto rounded-md bg-muted p-3 text-xs",
                              )}
                            >
                              {JSON.stringify(item.tool_calls, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
        </table>
      </div>
      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({totalCount} total)
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
