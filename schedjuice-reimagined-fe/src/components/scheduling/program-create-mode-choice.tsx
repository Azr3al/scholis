"use client";

import { Button } from "@/components/primitives";
import EntityCombobox from "@/components/form/entity-combobox";
import { useCreateFlow } from "@/components/scheduling/create-flow-context";
import {
  getFirstIntakeStep,
  intakeStepPath,
} from "@/components/scheduling/intake/intake-steps";
import type { IntakeFlowContext } from "@/components/scheduling/intake/intake-steps";
import { operatorEnum } from "@/types/api";
import type { intakeType } from "@/types/intake";
import { CourseCreationMethod, SubjectStrategy, programType } from "@/types/program";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function existingIntakeAddPath(programId: string, intakeId: number) {
  return `/courses/create/program/${programId}/intake/${intakeId}/add`;
}

export function ProgramCreateModeChoice({
  program,
  flowContext,
}: {
  program: programType;
  flowContext: IntakeFlowContext;
}) {
  const router = useRouter();
  const { reset, setState } = useCreateFlow();
  const [selectedIntakeId, setSelectedIntakeId] = useState<string>("");

  const intakeFilterParams = useMemo(
    () => ({
      filter_params: [
        {
          field_name: "program",
          operator: operatorEnum.exact,
          value: String(program.id),
        },
      ],
    }),
    [program.id],
  );

  function startNewIntake() {
    reset();
    setState({ programId: program.id });
    router.push(
      intakeStepPath(String(program.id), getFirstIntakeStep(flowContext)),
    );
  }

  function startExistingIntakeAdd() {
    if (!selectedIntakeId) return;
    router.push(existingIntakeAddPath(String(program.id), parseInt(selectedIntakeId, 10)));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Add classes</h1>
        <p className="text-sm text-text-muted">
          {program.name} — add courses to an existing intake or schedule a new
          intake batch.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface">
          <div className="p-6 pb-2">
            <h3 className="text-lg font-medium">Choose existing intake</h3>
          </div>
          <div className="space-y-4 p-6 pt-0">
            <p className="text-sm text-text-muted">
              Add one or more classes to an intake without running bulk
              generation.
            </p>
            <EntityCombobox
              entity="intakes"
              queryParams={{
                fields: ["id", "name", "start_date", "end_date"],
                sorts: ["-start_date", "name"],
              }}
              filterParams={intakeFilterParams}
              displayFunction={(entity) => {
                const intake = entity as intakeType;
                return intake.name;
              }}
              value={selectedIntakeId}
              onChange={setSelectedIntakeId}
              label="Intake"
              comboboxPlaceholder="Select an intake"
            />
            <Button
              type="button"
              disabled={!selectedIntakeId}
              onClick={startExistingIntakeAdd}
            >
              Continue
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface">
          <div className="p-6 pb-2">
            <h3 className="text-lg font-medium">Schedule new intake</h3>
          </div>
          <div className="space-y-4 p-6 pt-0">
            <p className="text-sm text-text-muted">
              Create a new intake and generate a batch of classes from the
              program structure.
            </p>
            <Button type="button" variant="secondary" onClick={startNewIntake}>
              Start intake wizard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { shouldShowProgramCreateModeChoice } from "./program-create-mode-choice-logic";
