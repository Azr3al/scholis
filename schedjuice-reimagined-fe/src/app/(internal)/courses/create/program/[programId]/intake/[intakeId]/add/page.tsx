"use client";

import { ExistingIntakeAddForm } from "@/components/scheduling/existing-intake-add-form";
import { useParams } from "next/navigation";

export default function ExistingIntakeAddPage() {
  const { programId, intakeId } = useParams<{
    programId: string;
    intakeId: string;
  }>();

  return <ExistingIntakeAddForm programId={programId} intakeId={intakeId} />;
}
