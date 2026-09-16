"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Select } from "@/components/primitives/select";
import {
  ToolbarSegmentGroup,
  ToolbarSegmentToggle,
} from "@/components/shell/toolbar-segment-group";
import { useHubFilters } from "@/hooks/academic-hub/use-hub-filters";
import { useHubAggregate } from "@/hooks/academic-hub/use-hub-aggregate";
import { pickDefaultIntake } from "@/helpers/academic-hub/pick-default-intake";
import { useHubIntakes } from "@/hooks/academic-hub/use-intakes";
import type { HubProgram } from "@/hooks/academic-hub/use-programs";
import { useUser } from "@/hooks/useUser";
import { HUB_PROGRAM_ALL } from "@/types/academic-hub";
import type { HubFacetRow } from "@/types/academic-hub";

const ALL_VALUE = "__all__";

interface Props {
  programs: HubProgram[];
}

function FacetToggleGroup({
  label,
  ariaLabel,
  rows,
  selected,
  onChange,
  isLoading,
}: {
  label: string;
  ariaLabel: string;
  rows?: HubFacetRow[];
  selected: string[];
  onChange: (next: string[]) => void;
  isLoading?: boolean;
}) {
  const sorted = useMemo(
    () => [...(rows ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );

  if (isLoading && sorted.length === 0) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm text-text-secondary">{label}</span>
        <span className="text-sm text-text-muted">Loading…</span>
      </div>
    );
  }

  if (sorted.length === 0) return null;

  const toggle = (id: string) => {
    const isOn = selected.includes(id);
    onChange(isOn ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-sm text-text-secondary">{label}</span>
      <ToolbarSegmentGroup aria-label={ariaLabel} className="max-w-full">
        {sorted.map((row) => {
          const id = String(row.id);
          const on = selected.includes(id);
          return (
            <ToolbarSegmentToggle
              key={id}
              active={on}
              count={row.count}
              onClick={() => toggle(id)}
            >
              {row.name}
            </ToolbarSegmentToggle>
          );
        })}
      </ToolbarSegmentGroup>
    </div>
  );
}

function IntakeField({
  programId,
  value,
  onChange,
}: {
  programId: string;
  value: string | null;
  onChange: (intakeId: string | null) => void;
}) {
  const { data, isLoading } = useHubIntakes(programId);
  const searchParams = useSearchParams();
  const initialized = useRef(false);

  useEffect(() => {
    initialized.current = false;
  }, [programId]);

  useEffect(() => {
    if (initialized.current) return;
    if (isLoading || !data) return;
    initialized.current = true;
    if (value !== null) return;
    if (searchParams.has("intake")) return;
    const def = pickDefaultIntake(data);
    if (def) onChange(String(def.id));
  }, [isLoading, data, value, searchParams, onChange]);

  const items = useMemo(
    () => [
      { value: ALL_VALUE, label: "All intakes" },
      ...(data ?? []).map((intake) => ({
        value: String(intake.id),
        label: intake.name,
      })),
    ],
    [data],
  );

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-sm text-text-secondary">Intake</span>
      <Select
        className="h-8 min-h-8 min-w-48 text-sm"
        items={items}
        value={value ?? ALL_VALUE}
        onValueChange={(v) => {
          const next = typeof v === "string" ? v : null;
          onChange(next === ALL_VALUE ? null : next);
        }}
        placeholder={isLoading ? "Loading…" : "All intakes"}
        disabled={isLoading}
      />
    </div>
  );
}

export function AcademicHubSecondaryToolbar({ programs }: Props) {
  const filters = useHubFilters();
  const { state } = filters;
  const { user } = useUser();
  const userId = user?.id ?? 0;

  const selectedProgram = programs.find(
    (p) => String(p.id) === state.program,
  );
  const isAllPrograms = state.program === HUB_PROGRAM_ALL;
  const isIntakeBased =
    selectedProgram?.course_creation_method === "intake_based";
  const isRequiredStrategy = selectedProgram?.subject_strategy === "required";

  const subjectAggregate = useHubAggregate({
    facet: "subject",
    state,
    userId,
    enabled: !isAllPrograms && isRequiredStrategy,
  });
  const categoryAggregate = useHubAggregate({
    facet: "category",
    state,
    userId,
    enabled: !isAllPrograms && !isRequiredStrategy,
  });

  const subjectPending =
    subjectAggregate.isLoading || subjectAggregate.isFetching;
  const categoryPending =
    categoryAggregate.isLoading || categoryAggregate.isFetching;

  return (
    <div className="flex w-full flex-wrap items-center gap-3 overflow-x-auto">
      {!isAllPrograms && isIntakeBased ? (
        <IntakeField
          programId={state.program}
          value={state.intake}
          onChange={filters.setIntake}
        />
      ) : null}

      {!isAllPrograms && isRequiredStrategy ? (
        <FacetToggleGroup
          label="Subject"
          ariaLabel="Subjects"
          rows={subjectAggregate.data?.subject}
          selected={state.subjects}
          onChange={filters.setSubjects}
          isLoading={subjectPending}
        />
      ) : null}

      {!isAllPrograms && !isRequiredStrategy ? (
        <FacetToggleGroup
          label="Category"
          ariaLabel="Categories"
          rows={categoryAggregate.data?.category}
          selected={state.categories}
          onChange={filters.setCategories}
          isLoading={categoryPending}
        />
      ) : null}
    </div>
  );
}
