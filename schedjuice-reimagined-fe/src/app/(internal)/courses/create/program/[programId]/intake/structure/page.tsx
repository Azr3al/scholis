"use client";

import { StructureStep } from "@/components/scheduling/intake/structure-step";
import { useParams } from "next/navigation";

export default function IntakeStructurePage() {
  const { programId } = useParams<{ programId: string }>();
  return <StructureStep programId={programId} />;
}
