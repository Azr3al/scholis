"use client";

import { DatesStep } from "@/components/scheduling/intake/dates-step";
import { useIntakeFlow } from "@/components/scheduling/intake/use-intake-flow";
import { useParams } from "next/navigation";

export default function IntakeDatesPage() {
  const { programId } = useParams<{ programId: string }>();
  const { flowContext } = useIntakeFlow(programId);

  return (
    <DatesStep
      programId={programId}
      stepId="dates"
      flowContext={flowContext}
    />
  );
}
