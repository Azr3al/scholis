"use client";

import { CreateFlowLoading } from "@/components/scheduling/create-flow-loading";
import { useCreateFlow } from "@/components/scheduling/create-flow-context";
import {
  ProgramCreateModeChoice,
  shouldShowProgramCreateModeChoice,
} from "@/components/scheduling/program-create-mode-choice";
import {
  getFirstIntakeStep,
  intakeStepPath,
} from "@/components/scheduling/intake/intake-steps";
import { useIntakeFlow } from "@/components/scheduling/intake/use-intake-flow";
import { CourseCreationMethod } from "@/types/program";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProgramCreateHubPage() {
  const { programId } = useParams<{ programId: string }>();
  const router = useRouter();
  const { reset, setState } = useCreateFlow();
  const { program, flowContext, isLoading, isError } = useIntakeFlow(programId);

  useEffect(() => {
    if (!program || isLoading) return;
    reset();
    setState({ programId: program.id });

    const base = `/courses/create/program/${programId}`;
    if (program.course_creation_method === CourseCreationMethod.manual) {
      router.replace(`${base}/manual`);
      return;
    }

    if (!shouldShowProgramCreateModeChoice(program)) {
      const firstStep = getFirstIntakeStep(flowContext);
      router.replace(intakeStepPath(programId, firstStep));
    }
  }, [program, programId, router, reset, setState, flowContext, isLoading]);

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Could not load program. Go back and try again.
      </p>
    );
  }

  if (isLoading || !program) {
    return <CreateFlowLoading message="Preparing form…" />;
  }

  if (program.course_creation_method === CourseCreationMethod.manual) {
    return <CreateFlowLoading message="Preparing form…" />;
  }

  if (shouldShowProgramCreateModeChoice(program)) {
    return <ProgramCreateModeChoice program={program} flowContext={flowContext} />;
  }

  return <CreateFlowLoading message="Preparing form…" />;
}
