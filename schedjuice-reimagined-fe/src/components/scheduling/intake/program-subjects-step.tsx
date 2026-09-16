"use client";

import { searchEntities } from "@/app/client-api/utils";
import { ProgramSubjectsEditor } from "@/components/program/program-subjects-editor";
import { Button, buttonVariants } from "@/components/primitives";
import {
  getNextIntakeStep,
  getPrevIntakeStep,
  intakeStepPath,
  type IntakeFlowContext,
  type IntakeStepId,
} from "@/components/scheduling/intake/intake-steps";
import { operatorEnum } from "@/types/api";
import { SubjectStrategy } from "@/types/program";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProgramSubjectsStep({
  programId,
  stepId,
  flowContext,
}: {
  programId: string;
  stepId: IntakeStepId;
  flowContext: IntakeFlowContext;
}) {
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["programSubjects", programId],
    queryFn: () =>
      searchEntities(
        "program-subjects",
        { expand: ["subject"] },
        {
          filter_params: [
            {
              field_name: "program",
              operator: operatorEnum.exact,
              value: programId,
            },
          ],
        },
      ),
  });

  const rows = (data?.data?.data ?? []) as unknown[];
  const hasSubjects = rows.length > 0;

  function handleContinue() {
    router.push(
      intakeStepPath(
        programId,
        getNextIntakeStep(stepId, flowContext)!,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Subjects in this program</h1>
        <p className="text-sm text-text-muted">
          Add the subjects (exam papers) this program offers. Each becomes one
          class per intake. Paste a whole column, or add them one at a time.{" "}
          <Link
            href="/subjects"
            className="text-primary underline underline-offset-4 hover:no-underline"
          >
            All subjects
          </Link>
        </p>
      </div>

      <ProgramSubjectsEditor
        programId={programId}
        subjectStrategy={SubjectStrategy.required}
      />

      <div className="flex justify-between">
        {getPrevIntakeStep(stepId, flowContext) ? (
          <Link
            href={intakeStepPath(
              programId,
              getPrevIntakeStep(stepId, flowContext)!,
            )}
            className={cn(buttonVariants({ variant: "secondary" }))}
          >
            Back
          </Link>
        ) : (
          <span />
        )}
        <Button
          type="button"
          onClick={handleContinue}
          disabled={isLoading || !hasSubjects}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
