import { SubjectStrategy } from "@/types/program";

export const SUBJECT_STRATEGY_LABELS: Record<
  SubjectStrategy,
  { title: string; hint: string }
> = {
  [SubjectStrategy.required]: {
    title: "Fixed subject list",
    hint: "One class per subject per intake (e.g. ACCA papers).",
  },
  [SubjectStrategy.multi]: {
    title: "K-12",
    hint: "Grades, sections and a curriculum.",
  },
  [SubjectStrategy.optional]: {
    title: "Free-form",
    hint: "Subject is just an optional tag on a class.",
  },
  [SubjectStrategy.none]: {
    title: "No subjects",
    hint: "Classes have no subject.",
  },
};

export function subjectStrategyLabel(strategy: SubjectStrategy): string {
  return SUBJECT_STRATEGY_LABELS[strategy]?.title ?? strategy;
}
