"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { useMemo } from "react";

import useImportStore from "@/store/import-store";
import { useHubPrograms } from "@/hooks/academic-hub/use-programs";
import { useHubIntakes } from "@/hooks/academic-hub/use-intakes";

type ImportCourseScopeSummaryProps = {
  onChange?: () => void;
};

export function ImportCourseScopeSummary({
  onChange,
}: ImportCourseScopeSummaryProps) {
  const scope = useImportStore((s) => s.courseScope);
  const { data: programs } = useHubPrograms();
  const programIdStr =
    scope.programId != null ? String(scope.programId) : null;
  const { data: intakes } = useHubIntakes(programIdStr);

  const selectedProgram = useMemo(
    () => programs?.find((p) => p.id === scope.programId) ?? null,
    [programs, scope.programId],
  );
  const selectedIntake = useMemo(
    () => intakes?.find((i) => i.id === scope.intakeId) ?? null,
    [intakes, scope.intakeId],
  );

  const label = useMemo(() => {
    if (!selectedProgram) return "Program not selected";
    if (selectedIntake) {
      return `${selectedProgram.name} - ${selectedIntake.name}`;
    }
    return selectedProgram.name;
  }, [selectedProgram, selectedIntake]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Courses scoped to</p>
        <p className="truncate text-sm font-medium">{label}</p>
      </div>
      {onChange ? (
        <Button type="button" variant="secondary" size="sm" onClick={onChange}>
          Change
        </Button>
      ) : null}
    </div>
  );
}
