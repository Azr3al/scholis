import type { CourseToken } from "@/lib/imports/resolution";

export type UserLinkCellData = {
  kind: "user-link-cell";
  raw: string;
  status:
    | "idle"
    | "resolving"
    | "new"
    | "ignored"
    | "error"
    | "pending_match"
    | "pending_candidates"
    | "confirmed";
  variant?: "create" | "roster";
  label?: string;
  candidateCount?: number;
  nameMismatch?: boolean;
  duplicateRole?: "kept" | "skipped";
  user?: { id: number; name: string; email: string };
};

export type CourseLinkCellData = {
  kind: "course-link-cell";
  raw: string;
  status: "idle" | "resolving" | "linked" | "needs_attention";
  tokens: (CourseToken & { conflict?: boolean })[];
};
