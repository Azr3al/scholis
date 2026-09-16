"use client";

import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Search } from "iconoir-react";
import { Input } from "@/components/primitives/input";
import {
  ToolbarSegment,
  ToolbarSegmentGroup,
  ToolbarSegmentToggle,
} from "@/components/shell/toolbar-segment-group";
import { useHubFilters } from "@/hooks/academic-hub/use-hub-filters";
import type { HubProgram } from "@/hooks/academic-hub/use-programs";
import { useTenant } from "@/hooks/useTenant";
import {
  HUB_STATUS_VALUES,
  STATUS_LABEL,
  toggleStatusSelection,
} from "@/helpers/academic-hub/status-counts";
import { HUB_PROGRAM_ALL } from "@/types/academic-hub";

export function AdmissionsCoursesToolbar({
  programs,
}: {
  programs: HubProgram[];
}) {
  const filters = useHubFilters();
  const { state } = filters;
  const { tenant } = useTenant();
  const programCount = tenant?.program_count ?? programs.length;
  const showProgramTabs = programCount > 1 && programs.length > 0;

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
            placeholder="Search title…"
            value={draftQ}
            onChange={(e) => {
              setDraftQ(e.target.value);
              setQDebounced(e.target.value);
            }}
            className="h-8 w-52 pl-8 text-sm sm:w-64"
          />
        </div>

        <ToolbarSegmentGroup aria-label="Course status">
          {HUB_STATUS_VALUES.map((status) => {
            const on = state.status.includes(status);
            return (
              <ToolbarSegmentToggle
                key={status}
                active={on}
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
