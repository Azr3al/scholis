"use client";

import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Search } from "iconoir-react";
import { Input } from "@/components/primitives/input";
import { Switch } from "@/components/primitives/switch";
import {
  ToolbarSegment,
  ToolbarSegmentGroup,
  ToolbarSegmentToggle,
} from "@/components/shell/toolbar-segment-group";
import { isStudent } from "@/helpers/authorization";
import { useHubFilters } from "@/hooks/academic-hub/use-hub-filters";
import type { HubProgram } from "@/hooks/academic-hub/use-programs";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import {
  countForStatus,
  HUB_STATUS_VALUES,
  STATUS_LABEL,
  toggleStatusSelection,
} from "@/helpers/academic-hub/status-counts";
import { HUB_PROGRAM_ALL, HubStatusAggregate } from "@/types/academic-hub";

interface Props {
  programs: HubProgram[];
  statusCounts?: HubStatusAggregate;
  isStatusCountsLoading?: boolean;
  onSetMy: (value: boolean) => void;
}

export function AcademicHubToolbar({
  programs,
  statusCounts,
  isStatusCountsLoading = false,
  onSetMy,
}: Props) {
  const filters = useHubFilters();
  const { state } = filters;
  const { isTeacher, user } = useUser();
  const { tenant } = useTenant();
  const programCount = tenant?.program_count ?? programs.length;
  const showProgramTabs = programCount > 1 && !isStudent(user);

  const setQDebounced = useDebouncedCallback(filters.setQ, 200);
  const [draftQ, setDraftQ] = useState(state.q);
  useEffect(() => setDraftQ(state.q), [state.q]);

  const programItems = [
    { id: HUB_PROGRAM_ALL, label: "All" },
    ...programs.map((p) => ({ id: String(p.id), label: p.name })),
  ];

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      {showProgramTabs ? (
        <ToolbarSegmentGroup role="tablist" aria-label="Program">
          {programItems.map((item) => (
            <ToolbarSegment
              key={item.id}
              role="tab"
              aria-selected={state.program === item.id}
              active={state.program === item.id}
              onClick={() => filters.setProgram(item.id)}
            >
              {item.label}
            </ToolbarSegment>
          ))}
        </ToolbarSegmentGroup>
      ) : (
        <span className="sr-only">Single program tenant</span>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            width={15}
            height={15}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input
            aria-label="Search courses"
            placeholder="Search title, code, subject, level, section…"
            value={draftQ}
            onChange={(e) => {
              setDraftQ(e.target.value);
              setQDebounced(e.target.value);
            }}
            className="h-8 w-52 pl-8 text-sm sm:w-64"
          />
        </div>

        {isTeacher ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <Switch
              checked={state.my}
              onCheckedChange={onSetMy}
              aria-label="My classes only"
            />
            <span className="hidden whitespace-nowrap sm:inline">
              My classes only
            </span>
          </label>
        ) : null}

        <ToolbarSegmentGroup aria-label="Course status">
          {HUB_STATUS_VALUES.map((status) => {
            const count = countForStatus(status, statusCounts);
            const on = state.status.includes(status);
            return (
              <ToolbarSegmentToggle
                key={status}
                active={on}
                count={
                  isStatusCountsLoading
                    ? "…"
                    : count !== undefined
                      ? count
                      : undefined
                }
                onClick={() =>
                  filters.setStatus(toggleStatusSelection(state.status, status))
                }
              >
                {STATUS_LABEL[status]}
              </ToolbarSegmentToggle>
            );
          })}
        </ToolbarSegmentGroup>
      </div>
    </div>
  );
}
