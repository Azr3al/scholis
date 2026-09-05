import { normalizeKey } from "./parse-subject-column";

export type SubjectRowStatus = "new" | "link" | "skip";

export type ExistingSubject = { id: number; name: string };

export function computeRowStatus(
  name: string,
  orgSubjects: ExistingSubject[],
  linkedSubjectIds: Set<number>,
): SubjectRowStatus {
  const key = normalizeKey(name);
  const match = orgSubjects.find((s) => normalizeKey(s.name) === key);
  if (!match) return "new";
  return linkedSubjectIds.has(match.id) ? "skip" : "link";
}

type StatusSummary = {
  new: number;
  link: number;
  skip: number;
  actionable: number;
};

export function summarizeStatuses(
  statuses: SubjectRowStatus[],
): StatusSummary {
  const summary: StatusSummary = { new: 0, link: 0, skip: 0, actionable: 0 };
  for (const s of statuses) {
    summary[s] += 1;
    if (s !== "skip") summary.actionable += 1;
  }
  return summary;
}
