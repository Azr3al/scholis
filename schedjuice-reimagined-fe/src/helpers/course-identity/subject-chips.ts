import { SubjectStrategy } from "@/types/program";

export type SubjectChip = { id: string; name: string };

type SubjectRelation = number | { id: number; name: string } | null | undefined;

type ProgramRelation =
  | number
  | { subject_strategy?: string }
  | null
  | undefined;

export type SubjectChipSource = {
  program?: ProgramRelation;
  subject?: SubjectRelation;
  course_subjects?: { subject: SubjectRelation }[];
};

function isSubjectObject(
  subject: SubjectRelation,
): subject is { id: number; name: string } {
  return typeof subject === "object" && subject !== null;
}

function subjectStrategy(program: ProgramRelation): string {
  return typeof program === "object" && program !== null
    ? (program.subject_strategy ?? SubjectStrategy.none)
    : SubjectStrategy.none;
}

export function selectSubjectChips(source: SubjectChipSource): SubjectChip[] {
  const strategy = subjectStrategy(source.program);

  if (
    strategy === SubjectStrategy.required &&
    isSubjectObject(source.subject) &&
    source.subject.name
  ) {
    return [{ id: String(source.subject.id), name: source.subject.name }];
  }

  if (strategy === SubjectStrategy.multi && source.course_subjects?.length) {
    return source.course_subjects
      .map((cs) => cs.subject)
      .filter((s): s is { id: number; name: string } => isSubjectObject(s))
      .map((s) => ({ id: String(s.id), name: s.name }));
  }

  if (
    strategy === SubjectStrategy.optional &&
    isSubjectObject(source.subject) &&
    source.subject.name
  ) {
    return [{ id: String(source.subject.id), name: source.subject.name }];
  }

  return [];
}

export function truncateSubjectChips(
  chips: SubjectChip[],
  max: number,
): { visible: SubjectChip[]; overflow: number } {
  if (chips.length <= max) {
    return { visible: chips, overflow: 0 };
  }
  return { visible: chips.slice(0, max), overflow: chips.length - max };
}
