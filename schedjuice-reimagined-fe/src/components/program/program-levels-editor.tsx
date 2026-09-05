"use client";

import { ProgramStructureEditor } from "./program-structure-editor";

export function ProgramLevelsEditor({ programId }: { programId: string }) {
  return <ProgramStructureEditor mode="persist" programId={programId} />;
}
