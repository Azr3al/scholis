"use client";

import { CoursePreviewStep } from "@/components/scheduling/intake/course-preview-step";
import { useIntakeFlow } from "@/components/scheduling/intake/use-intake-flow";
import { useParams } from "next/navigation";

export default function IntakePreviewPage() {
  const { programId } = useParams<{ programId: string }>();
  const { flowContext } = useIntakeFlow(programId);

  return (
    <CoursePreviewStep
      programId={programId}
      stepId="preview"
      flowContext={flowContext}
    />
  );
}
