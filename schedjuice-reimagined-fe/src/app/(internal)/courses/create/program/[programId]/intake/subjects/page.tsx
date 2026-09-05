"use client";

import { LevelSubjectsStep } from "@/components/scheduling/intake/level-subjects-step";
import { ProgramSubjectsStep } from "@/components/scheduling/intake/program-subjects-step";
import { useIntakeFlow } from "@/components/scheduling/intake/use-intake-flow";
import { SubjectStrategy } from "@/types/program";
import { useParams } from "next/navigation";

export default function IntakeSubjectsPage() {
  const { programId } = useParams<{ programId: string }>();
  const { flowContext, subjectStrategy } = useIntakeFlow(programId);

  if (subjectStrategy === SubjectStrategy.required) {
    return (
      <ProgramSubjectsStep
        programId={programId}
        stepId="subjects"
        flowContext={flowContext}
      />
    );
  }

  return (
    <LevelSubjectsStep
      programId={programId}
      stepId="subjects"
      flowContext={flowContext}
    />
  );
}
