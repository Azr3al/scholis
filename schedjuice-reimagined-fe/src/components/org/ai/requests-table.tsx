"use client";
import { Button } from "@/components/primitives";

import { RequestOutcomeBadge } from "@/components/org/ai/request-outcome-badge";
import { ThinkingStepsBlock } from "@/components/org/ai/thinking-steps-block";
import { cn } from "@/lib/utils";
import {
  AiUsageRequestItem,
  formatAiTokens,
  RequestsSort,
} from "@/types/ai-usage";
import { NavArrowDown as ChevronDown, NavArrowRight as ChevronRight } from "iconoir-react";
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

export function RequestsTable({
  items,
  page,
  pageSize,
  totalCount,
  onPageChange,
  sort = "-created_at",
  onSortChange,
}: {
  items: AiUsageRequestItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  sort?: RequestsSort;
  onSortChange?: (sort: RequestsSort) => void;
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

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No AI requests this month.
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
            <col className="w-[6.5rem]" />
            <col className="w-[8rem]" />
            <col />
            <col className="w-[5rem]" />
            <col className="w-[5.5rem]" />
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
              <th>Outcome</th>
              <th>User</th>
              <th>Question</th>
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
              <SortableHeader
                label="Tokens"
                active={sort === "total_tokens" || sort === "-total_tokens"}
                onClick={() =>
                  onSortChange?.(
                    sort === "-total_tokens" ? "total_tokens" : "-total_tokens",
                  )
                }
                className="text-right"
              />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const expanded = expandedId === item.id;
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
                      {formatWhen(item.created_at)}
                    </td>
                    <td>
                      <RequestOutcomeBadge outcome={item.outcome} />
                    </td>
                    <td className="max-w-[8rem] min-w-0 truncate text-sm">
                      {item.user_display_name}
                    </td>
                    <td
                      className="max-w-0 min-w-0 truncate text-sm"
                      title={item.prompt}
                    >
                      {truncatePrompt(item.prompt)}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {item.tool_iterations}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {formatAiTokens(item.total_tokens)}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr>
                      <td colSpan={7} className="bg-muted/30 p-0 whitespace-normal">
                        <div className="space-y-3 break-words p-4 text-sm">
                          <div>
                            <p className="mb-1 font-medium text-muted-foreground">
                              Reasoning
                            </p>
                            <ThinkingStepsBlock
                              steps={item.thinking_steps}
                              toolIterations={item.tool_iterations}
                            />
                          </div>
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
