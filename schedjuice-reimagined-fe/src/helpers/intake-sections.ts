import type { LevelSectionSelection } from "@/types/intake";

export type ProgramSectionRow = { id: number; name: string; levelId: number };

export function groupSectionsByLevel(
  sections: ProgramSectionRow[],
): Record<number, ProgramSectionRow[]> {
  const map: Record<number, ProgramSectionRow[]> = {};
  for (const section of sections) {
    if (!map[section.levelId]) map[section.levelId] = [];
    map[section.levelId].push(section);
  }
  for (const levelId of Object.keys(map)) {
    map[Number(levelId)].sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
}

export function defaultSectionSelectionsForLevel(
  programSections: ProgramSectionRow[],
): LevelSectionSelection[] {
  return programSections.map((section) => ({
    name: section.name,
    sectionId: section.id,
  }));
}

export function buildDefaultLevelSectionOverrides(
  programSectionsByLevel: Record<number, ProgramSectionRow[]>,
): Record<number, LevelSectionSelection[]> {
  const overrides: Record<number, LevelSectionSelection[]> = {};
  for (const [levelId, sections] of Object.entries(programSectionsByLevel)) {
    overrides[Number(levelId)] = defaultSectionSelectionsForLevel(sections);
  }
  return overrides;
}

export function toLevelSectionNames(
  overrides?: Record<number, LevelSectionSelection[]>,
): Record<string, string[]> | undefined {
  if (!overrides) return undefined;
  const result: Record<string, string[]> = {};
  for (const [levelId, sections] of Object.entries(overrides)) {
    result[levelId] = sections.map((section) => section.name);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function serializeLevelSectionOverrides(
  overrides?: Record<number, LevelSectionSelection[]>,
): string {
  if (!overrides) return "";
  return JSON.stringify(
    Object.entries(overrides)
      .map(([levelId, sections]) => [
        levelId,
        sections.map((section) => ({
          name: section.name,
          sectionId: section.sectionId ?? null,
        })),
      ])
      .sort(([a], [b]) => Number(a) - Number(b)),
  );
}

export function sectionNameExists(
  sections: LevelSectionSelection[],
  name: string,
): boolean {
  const normalized = name.trim().toLowerCase();
  return sections.some((section) => section.name.trim().toLowerCase() === normalized);
}

export function findProgramSectionByName(
  programSections: ProgramSectionRow[],
  name: string,
): ProgramSectionRow | undefined {
  const normalized = name.trim().toLowerCase();
  return programSections.find(
    (section) => section.name.trim().toLowerCase() === normalized,
  );
}

export type CreateProgramSectionFn = (
  levelId: number,
  name: string,
  sortOrder: number,
) => Promise<{ id: number; name: string }>;

export async function ensureProgramSectionsForIntake(
  overrides: Record<number, LevelSectionSelection[]>,
  programSectionsByLevel: Record<number, ProgramSectionRow[]>,
  createSection: CreateProgramSectionFn,
): Promise<Record<number, LevelSectionSelection[]>> {
  const next: Record<number, LevelSectionSelection[]> = {};
  const sectionsByLevel = { ...programSectionsByLevel };

  for (const [levelIdStr, sections] of Object.entries(overrides)) {
    const levelId = Number(levelIdStr);
    const programSections = [...(sectionsByLevel[levelId] ?? [])];
    const resolved: LevelSectionSelection[] = [];
    let sortOrder = programSections.length;

    for (const section of sections) {
      if (section.sectionId != null) {
        const linked = programSections.find((row) => row.id === section.sectionId);
        resolved.push({
          name: linked?.name ?? section.name,
          sectionId: section.sectionId,
        });
        continue;
      }

      const existing = findProgramSectionByName(programSections, section.name);
      if (existing) {
        resolved.push({ name: existing.name, sectionId: existing.id });
        continue;
      }

      const trimmedName = section.name.trim();
      const created = await createSection(levelId, trimmedName, sortOrder);
      sortOrder += 1;
      const createdRow: ProgramSectionRow = {
        id: created.id,
        name: created.name,
        levelId,
      };
      programSections.push(createdRow);
      sectionsByLevel[levelId] = programSections;
      resolved.push({ name: created.name, sectionId: created.id });
    }

    next[levelId] = resolved;
  }

  return next;
}

export function validateLevelSectionsForSubjects(
  levels: { id: number }[],
  subjectIdsByLevel: Record<number, number[]>,
  sectionOverrides?: Record<number, LevelSectionSelection[]>,
): string | null {
  for (const level of levels) {
    const subjectCount = subjectIdsByLevel[level.id]?.length ?? 0;
    const sectionCount = sectionOverrides?.[level.id]?.length ?? 0;
    if (subjectCount > 0 && sectionCount === 0) {
      return "Each level with subjects needs at least one section for this intake.";
    }
  }
  return null;
}
