"use client";

import { useDebouncedCallback } from "use-debounce";
import { List, Search, ViewGrid } from "iconoir-react";
import { Input } from "@/components/primitives/input";
import {
  ToolbarSegment,
  ToolbarSegmentGroup,
  ToolbarSegmentToggle,
} from "@/components/shell/toolbar-segment-group";
import type {
  StudentPhotoTypeFilter,
  StudentPhotoViewMode,
} from "@/hooks/course-student-info/use-course-student-photo-filters";

const TYPE_OPTIONS: { value: StudentPhotoTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "id", label: "ID Photos" },
  { value: "award", label: "Award Photos" },
];

const VIEW_OPTIONS: {
  value: StudentPhotoViewMode;
  label: string;
  icon: typeof ViewGrid;
}[] = [
  { value: "gallery", label: "Gallery view", icon: ViewGrid },
  { value: "list", label: "List view", icon: List },
];

export function StudentPhotoToolbar({
  typeFilter,
  viewMode,
  search,
  onTypeChange,
  onViewChange,
  onSearchChange,
}: {
  typeFilter: StudentPhotoTypeFilter;
  viewMode: StudentPhotoViewMode;
  search: string;
  onTypeChange: (type: StudentPhotoTypeFilter) => void;
  onViewChange: (view: StudentPhotoViewMode) => void;
  onSearchChange: (q: string) => void;
}) {
  const onSearchDebounced = useDebouncedCallback(onSearchChange, 150);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <ToolbarSegmentGroup aria-label="Photo type">
        {TYPE_OPTIONS.map(({ value, label }) => (
          <ToolbarSegmentToggle
            key={value}
            active={typeFilter === value}
            onClick={() => onTypeChange(value)}
          >
            {label}
          </ToolbarSegmentToggle>
        ))}
      </ToolbarSegmentGroup>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            width={15}
            height={15}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input
            aria-label="Search students"
            placeholder="Search name or email…"
            defaultValue={search}
            className="h-8 w-56 pl-8"
            onChange={(e) => onSearchDebounced(e.target.value)}
          />
        </div>

        <ToolbarSegmentGroup aria-label="View mode">
          {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
            <ToolbarSegment
              key={value}
              icon
              active={viewMode === value}
              aria-label={label}
              title={label}
              onClick={() => onViewChange(value)}
            >
              <Icon width={16} height={16} />
            </ToolbarSegment>
          ))}
        </ToolbarSegmentGroup>
      </div>
    </div>
  );
}
