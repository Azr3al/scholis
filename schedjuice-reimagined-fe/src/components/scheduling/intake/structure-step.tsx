"use client";

import { setupProgramStructure } from "@/app/client-api/utils";
import {
  ProgramStructureEditor,
  validateStructureDraft,
} from "@/components/program/program-structure-editor";
import { CreateFlowLoading } from "@/components/scheduling/create-flow-loading";
import { useCreateFlow } from "@/components/scheduling/create-flow-context";
import {
  getNextIntakeStep,
  intakeStepPath,
} from "@/components/scheduling/intake/intake-steps";
import { useIntakeFlow } from "@/components/scheduling/intake/use-intake-flow";
import { Button } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { draftLevelsToSetupPayload } from "@/types/program";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export function StructureStep({ programId }: { programId: string }) {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { state, setState } = useCreateFlow();
  const { flowContext, hasProgramStructure, isLoading } = useIntakeFlow(programId);
  const [validationError, setValidationError] = useState<string | null>(null);

  const draft = state.structureDraft ?? [];

  useEffect(() => {
    if (isLoading || !hasProgramStructure) return;
    router.replace(intakeStepPath(programId, "subjects"));
  }, [hasProgramStructure, isLoading, programId, router]);

  const saveMutation = useMutation({
    mutationFn: () =>
      setupProgramStructure(programId, draftLevelsToSetupPayload(draft)),
    onSuccess: () => {
      setState({ structurePersisted: true, structureDraft: undefined });
      qc.invalidateQueries({ queryKey: ["programLevels", programId] });
      qc.invalidateQueries({ queryKey: ["intake-levels", programId] });
      qc.invalidateQueries({ queryKey: ["program-has-levels", programId] });
      router.push(
        intakeStepPath(
          programId,
          getNextIntakeStep("structure", flowContext)!,
        ),
      );
    },
    onError: (error: unknown) => {
      const message = parseSchedjuiceApiError(
        error,
        "Could not save program structure.",
      );
      setValidationError(message);
      toast.add({
        title: "Could not save structure",
        description: message,
      });
    },
  });

  const continueDisabled = useMemo(
    () => validateStructureDraft(draft) !== null,
    [draft],
  );

  function handleContinue() {
    const error = validateStructureDraft(draft);
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError(null);
    saveMutation.mutate();
  }

  if (isLoading || hasProgramStructure) {
    return <CreateFlowLoading message="Loading…" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Program structure</h1>
        <p className="text-sm text-text-muted">
          Add levels and sections for this program. You only do this once for the
          first intake.
        </p>
      </div>

      <ProgramStructureEditor
        mode="draft"
        value={draft}
        onChange={(next) => {
          setValidationError(null);
          setState({ structureDraft: next });
        }}
      />

      {validationError && (
        <p className="text-sm text-destructive">{validationError}</p>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleContinue}
          disabled={continueDisabled || saveMutation.isPending}
          isLoading={saveMutation.isPending}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
