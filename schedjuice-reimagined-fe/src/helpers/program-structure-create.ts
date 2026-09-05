import { makePostRequest, searchEntities } from "@/app/client-api/utils";
import type { EntityComboboxCreateNewConfig } from "@/components/form/entity-combobox";
import { operatorEnum } from "@/types/api";
import type { QueryClient } from "@tanstack/react-query";

export type ProgramLevelCreateResult = {
  levelId: number;
  levelName: string;
  sectionId: number;
  sectionName: string;
};

export type ProgramSectionCreateResult = {
  sectionId: number;
  sectionName: string;
};

export async function createProgramLevelWithDefaultSection(
  programId: string | number,
  name: string,
  sortOrder = 0,
): Promise<ProgramLevelCreateResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Level name is required.");
  }

  const levelRes = await makePostRequest("program-levels", {
    program: typeof programId === "string" ? parseInt(programId, 10) : programId,
    name: trimmed,
    sort_order: sortOrder,
  });
  const levelId = levelRes?.data?.data?.id;
  const levelName = levelRes?.data?.data?.name ?? trimmed;
  if (levelId == null) {
    throw new Error("Level was created but no id was returned.");
  }

  const sectionRes = await makePostRequest("program-level-sections", {
    level: levelId,
    name: "A",
    sort_order: 0,
  });
  const sectionId = sectionRes?.data?.data?.id;
  const sectionName = sectionRes?.data?.data?.name ?? "A";
  if (sectionId == null) {
    throw new Error("Default section was created but no id was returned.");
  }

  return { levelId, levelName, sectionId, sectionName };
}

export async function createProgramSection(
  levelId: number,
  name: string,
  sortOrder = 0,
): Promise<ProgramSectionCreateResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Section name is required.");
  }

  const sectionRes = await makePostRequest("program-level-sections", {
    level: levelId,
    name: trimmed,
    sort_order: sortOrder,
  });
  const sectionId = sectionRes?.data?.data?.id;
  const sectionName = sectionRes?.data?.data?.name ?? trimmed;
  if (sectionId == null) {
    throw new Error("Section was created but no id was returned.");
  }

  return { sectionId, sectionName };
}

export async function levelHasProgramLevelSubjects(levelId: number): Promise<boolean> {
  const res = await searchEntities(
    "program-level-subjects",
    { fields: ["id"], page: 1, size: 1 },
    {
      filter_params: [
        {
          field_name: "level",
          operator: operatorEnum.exact,
          value: String(levelId),
        },
      ],
    },
  );
  return ((res?.data?.data ?? []) as unknown[]).length > 0;
}

export async function saveProgramLevelSubjects(
  levelId: number,
  subjectIds: number[],
): Promise<void> {
  if (subjectIds.length === 0) return;
  if (await levelHasProgramLevelSubjects(levelId)) return;

  for (let i = 0; i < subjectIds.length; i++) {
    await makePostRequest("program-level-subjects", {
      level: levelId,
      subject: subjectIds[i],
      sort_order: i,
    });
  }
}

export function invalidateIntakeAddStructureQueries(
  queryClient: QueryClient,
  programId: string,
): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["existing-intake-add-levels", programId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["existing-intake-add-sections", programId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["existing-intake-add-level-subjects", programId],
    }),
  ]).then(() => undefined);
}

export function buildLevelCreateConfig(
  programId: string,
  levelCount: number,
  onCreated?: (result: ProgramLevelCreateResult) => void | Promise<void>,
): EntityComboboxCreateNewConfig {
  return {
    buttonLabel: "New level",
    dialogTitle: "Create level",
    inputLabel: "Name",
    inputPlaceholder: "e.g. Year 8",
    create: async (name) => {
      const result = await createProgramLevelWithDefaultSection(
        programId,
        name,
        levelCount,
      );
      await onCreated?.(result);
      return result.levelId;
    },
  };
}

export function buildSectionCreateConfig(
  levelId: number,
  sectionCount: number,
  onCreated?: (result: ProgramSectionCreateResult) => void | Promise<void>,
): EntityComboboxCreateNewConfig {
  return {
    buttonLabel: "New section",
    dialogTitle: "Create section",
    inputLabel: "Name",
    inputPlaceholder: "e.g. B",
    create: async (name) => {
      const result = await createProgramSection(levelId, name, sectionCount);
      await onCreated?.(result);
      return result.sectionId;
    },
  };
}
