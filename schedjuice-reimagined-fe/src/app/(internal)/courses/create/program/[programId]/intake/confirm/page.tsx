"use client";

import { ConfirmStep } from "@/components/scheduling/intake/confirm-step";
import { useIntakeFlow } from "@/components/scheduling/intake/use-intake-flow";
import { useParams } from "next/navigation";

export default function IntakeConfirmPage() {
  const { programId } = useParams<{ programId: string }>();
  const { flowContext } = useIntakeFlow(programId);

  return (
    <ConfirmStep
      programId={programId}
      stepId="confirm"
      flowContext={flowContext}
    />
  );
}
