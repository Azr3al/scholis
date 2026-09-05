export type BulkStudentRowStatus =
  | "ready"
  | "needs_ms_link"
  | "not_found"
  | "already_on_roster"
  | "duplicate";

export type BulkStudentSearchHit = {
  id: number;
  email: string;
  name: string;
  microsoft_id?: string | null;
};

type BulkStudentPreviewRow = {
  index: number;
  email: string;
  status: BulkStudentRowStatus;
  user?: BulkStudentSearchHit;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function classifyBulkStudentRows({
  emails,
  hitsByEmail,
  rosterEmails,
  requiresMsLink,
}: {
  emails: string[];
  hitsByEmail: Map<string, BulkStudentSearchHit>;
  rosterEmails: Set<string>;
  requiresMsLink: boolean;
}): BulkStudentPreviewRow[] {
  const seen = new Set<string>();
  return emails.map((email, index) => {
    const key = normalizeEmail(email);
    if (seen.has(key)) {
      return { index, email, status: "duplicate" as const };
    }
    seen.add(key);

    const hit = hitsByEmail.get(key);
    if (!hit) {
      return { index, email, status: "not_found" as const };
    }
    if (rosterEmails.has(normalizeEmail(hit.email))) {
      return { index, email, status: "already_on_roster" as const, user: hit };
    }
    if (requiresMsLink && !hit.microsoft_id) {
      return { index, email, status: "needs_ms_link" as const, user: hit };
    }
    return { index, email, status: "ready" as const, user: hit };
  });
}

export function summarizeBulkStudentRows(rows: BulkStudentPreviewRow[]) {
  let ready = 0;
  let needsMsLink = 0;
  let notFound = 0;
  let alreadyOnRoster = 0;
  let duplicate = 0;
  const readyUsers: BulkStudentSearchHit[] = [];

  for (const row of rows) {
    switch (row.status) {
      case "ready":
        ready += 1;
        if (row.user) readyUsers.push(row.user);
        break;
      case "needs_ms_link":
        needsMsLink += 1;
        break;
      case "not_found":
        notFound += 1;
        break;
      case "already_on_roster":
        alreadyOnRoster += 1;
        break;
      case "duplicate":
        duplicate += 1;
        break;
    }
  }

  return { ready, needsMsLink, notFound, alreadyOnRoster, duplicate, readyUsers };
}

export const BULK_STUDENT_STATUS_LABEL: Record<BulkStudentRowStatus, string> = {
  ready: "Ready to add",
  needs_ms_link: "Needs Microsoft link",
  not_found: "Not found",
  already_on_roster: "Already on roster",
  duplicate: "Duplicate",
};
