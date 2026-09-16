import type { Issue, IssueStatus, IssueStatusBehavior } from "@/types/issue";

export function resolveIssueStatus(issue: Issue): IssueStatus | null {
  return typeof issue.status === "object" ? issue.status : null;
}

export function issueStatusBehavior(issue: Issue): IssueStatusBehavior | undefined {
  return resolveIssueStatus(issue)?.behavior;
}

export function isComplaintClosed(issue: Issue): boolean {
  const behavior = issueStatusBehavior(issue);
  return behavior === "DONE" || behavior === "CANCELLED";
}

export function resolveOpenStatusIdFromIssues(issues: Issue[]): number | undefined {
  for (const issue of issues) {
    const status = resolveIssueStatus(issue);
    if (status && (status.name === "Open" || status.is_default)) {
      return status.id;
    }
  }
  return undefined;
}

export function rememberOpenStatusId(
  status: IssueStatus | null | undefined,
): number | undefined {
  if (!status) return undefined;
  if (status.name === "Open" || status.is_default) {
    return status.id;
  }
  return undefined;
}
