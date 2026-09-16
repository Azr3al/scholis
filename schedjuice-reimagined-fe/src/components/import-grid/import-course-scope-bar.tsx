"use client";
import { AlertDialog, Select } from "@/components/primitives";

import { useMemo, useState } from "react";

import useImportStore from "@/store/import-store";
import { useHubPrograms } from "@/hooks/academic-hub/use-programs";
import { useHubIntakes } from "@/hooks/academic-hub/use-intakes";
import {
  type CourseScope,
  isCourseScoped,
  isScopeComplete,
} from "@/lib/imports/course-scope";
import { cn } from "@/lib/utils";

type ImportCourseScopeBarProps = {
  /** When false, scope changes apply immediately (e.g. on the Map step). */
  confirmOnChange?: boolean;
};

export function ImportCourseScopeBar({
  confirmOnChange = true,
}: ImportCourseScopeBarProps) {
  const scope = useImportStore((s) => s.courseScope);
  const setCourseScope = useImportStore((s) => s.setCourseScope);

  const { data: programs, isError: programsError } = useHubPrograms();
  const programIdStr =
    scope.programId != null ? String(scope.programId) : undefined;
  const { data: intakes, isLoading: intakesLoading } =
    useHubIntakes(programIdStr ?? null);

  const [pending, setPending] = useState<CourseScope | null>(null);

  const selectedProgram = useMemo(
    () => programs?.find((p) => p.id === scope.programId) ?? null,
    [programs, scope.programId],
  );
  const showIntake =
    selectedProgram?.course_creation_method === "intake_based";
  const scopeComplete = isScopeComplete(scope, selectedProgram);

  const applyChange = (next: CourseScope) => {
    if (confirmOnChange && isCourseScoped(scope)) {
      setPending(next);
    } else {
      setCourseScope(next);
    }
  };

  const onProgramChange = (value: string) => {
    applyChange({ programId: Number(value), intakeId: null });
  };

  const onIntakeChange = (value: string) => {
    applyChange({
      programId: scope.programId,
      intakeId: Number(value),
    });
  };

  if (programsError) {
    return (
      <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        Couldn&apos;t load programs. Reload the page and try again.
      </div>
    );
  }

  const programUnset = scope.programId == null;
  const intakeUnset =
    showIntake && scope.intakeId == null && scope.programId != null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border px-3 py-3",
        scopeComplete
          ? "border-border bg-muted/30"
          : "border-primary/40 bg-primary/5 ring-1 ring-primary/20",
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">Scope course enrollments</span>
        <span className="text-xs text-muted-foreground">
          Required — pick the program courses belong to
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Program</span>
          <Select
            value={programIdStr}
            onValueChange={onProgramChange}
            className={cn(
              "h-8 w-56",
              programUnset && "border-primary/50 ring-1 ring-primary/30",
            )}
            placeholder="Select a program"
            items={(programs ?? []).map((p) => ({
              value: String(p.id),
              label: p.name,
            }))}
          />
        </div>

        {showIntake ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Intake</span>
            <Select
              value={
                scope.intakeId != null ? String(scope.intakeId) : undefined
              }
              onValueChange={onIntakeChange}
              disabled={intakesLoading}
              className={cn(
                "h-8 w-56",
                intakeUnset && "border-primary/50 ring-1 ring-primary/30",
              )}
              placeholder={intakesLoading ? "Loading…" : "Select an intake"}
              items={(intakes ?? []).map((i) => ({
                value: String(i.id),
                label: i.name,
              }))}
            />
          </div>
        ) : null}
      </div>

      <AlertDialog.Root
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialog.Portal>
        <AlertDialog.Backdrop />
        <AlertDialog.Popup>
          <div>
            <AlertDialog.Title>Re-scope course matching?</AlertDialog.Title>
            <AlertDialog.Description>
              Changing the program or intake re-runs course matching from
              scratch and discards all current course links, including manual
              picks. Continue?
            </AlertDialog.Description>
          </div>
          <div>
            <AlertDialog.Close onClick={() => setPending(null)}>
              Cancel
            </AlertDialog.Close>
            <AlertDialog.Close
              onClick={() => {
                if (pending) setCourseScope(pending);
                setPending(null);
              }}
            >
              Re-scope &amp; re-resolve
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
