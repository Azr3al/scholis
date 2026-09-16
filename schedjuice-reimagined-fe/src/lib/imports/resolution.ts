import type {
  CourseCandidate,
  CourseResolution,
  UserMatchCandidate,
  UserMatchResult,
  UserRef,
} from "@/app/client-api/imports";
import { isLegalEmail } from "@/lib/imports/validation";
import { isValidEmail, splitCourseTokens } from "@/lib/imports/wizard-logic";

export type CellStatus =
  | "idle"
  | "resolving"
  | "linked"
  | "needs_attention"
  | "new"
  | "ignored"
  | "error"
  | "pending_match"
  | "pending_candidates"
  | "confirmed";

type TokenOrigin = "auto" | "propagated" | "manual";

export type CourseToken = {
  raw: string;
  status: "resolving" | "linked" | "needs_attention" | "none";
  match: { id: number; title: string } | null;
  candidates: CourseCandidate[];
  origin?: TokenOrigin;
};

export type CellResolution = {
  status: CellStatus;
  entityRef?: { id: number; label: string; email?: string };
  tokens?: CourseToken[];
  candidates?: UserMatchCandidate[];
  confirmedUserId?: number;
  matchField?: string | null;
  nameMismatch?: boolean;
};

function normalizeImportName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function computeNameMismatch(
  matchField: string | null | undefined,
  importedName: string | null | undefined,
  matchedUserName: string,
): boolean {
  if (!matchField || matchField === "email") return false;
  if (!importedName?.trim()) return false;
  return normalizeImportName(importedName) !== normalizeImportName(matchedUserName);
}

export function cellKey(rowId: string, field: string): string {
  return `${rowId}:${field}`;
}

function lookupUser(
  userMap: Record<string, UserRef | null>,
  value: string,
): UserRef | null | undefined {
  if (value in userMap) return userMap[value];
  const lower = value.toLowerCase();
  const key = Object.keys(userMap).find((k) => k.toLowerCase() === lower);
  return key ? userMap[key] : undefined;
}

export function buildUserResolutions(
  rows: (string | number | null)[][],
  colIndex: number,
  rowIds: string[],
  userMap: Record<string, UserRef | null>,
): Map<string, CellResolution> {
  const out = new Map<string, CellResolution>();
  rows.forEach((row, i) => {
    const raw = row[colIndex];
    const value = raw === null || raw === undefined ? "" : String(raw).trim();
    const key = cellKey(rowIds[i], "email");
    if (!value) {
      out.set(key, { status: "idle" });
      return;
    }
    if (!isValidEmail(value)) {
      out.set(key, { status: "error" });
      return;
    }
    const found = lookupUser(userMap, value);
    if (found) {
      out.set(key, {
        status: "linked",
        entityRef: { id: found.id, label: found.name },
      });
    } else if (found === null) {
      out.set(key, { status: "new" });
    } else {
      out.set(key, { status: "new" });
    }
  });
  return out;
}

export type MatchSpecResolved = {
  fieldKey: string;
  colIndex: number;
  type: "email" | "phone";
  fuzzy: boolean;
};

export function buildUserMatches(
  rows: (string | number | null)[][],
  specs: MatchSpecResolved[],
  priority: string[],
  rowIds: string[],
  results: Record<string, Record<string, UserMatchResult>>,
  nameColIndex: number | null = null,
  strictNameConsistency = false,
): Map<string, CellResolution> {
  const out = new Map<string, CellResolution>();
  const orderedSpecs = [...specs].sort(
    (a, b) => priority.indexOf(a.fieldKey) - priority.indexOf(b.fieldKey),
  );
  const emailSpec = specs.find((s) => s.fieldKey === "email");
  const primaryField =
    priority.find((field) => orderedSpecs.some((spec) => spec.fieldKey === field)) ??
    orderedSpecs[0]?.fieldKey ??
    "email";

  rows.forEach((row, i) => {
    const key = cellKey(rowIds[i], primaryField);
    const emailRaw = emailSpec ? row[emailSpec.colIndex] : null;
    const emailValue =
      emailRaw === null || emailRaw === undefined ? "" : String(emailRaw).trim();

    if (emailValue && !isLegalEmail(emailValue)) {
      out.set(key, { status: "error" });
      return;
    }

    let exact: UserMatchResult | null = null;
    const candidates: UserMatchCandidate[] = [];
    for (const spec of orderedSpecs) {
      const raw = row[spec.colIndex];
      const value = raw === null || raw === undefined ? "" : String(raw).trim();
      if (!value) continue;
      const res = results[spec.fieldKey]?.[value];
      if (!res) continue;
      if (res.kind === "exact" && res.user && !exact) {
        exact = res;
      } else if (res.kind === "fuzzy") {
        candidates.push(...res.candidates);
      }
    }

    if (exact?.user) {
      const extra = candidates.filter((c) => c.user.id !== exact!.user!.id);
      const importedNameRaw = nameColIndex != null ? row[nameColIndex] : null;
      const importedName =
        importedNameRaw === null || importedNameRaw === undefined
          ? ""
          : String(importedNameRaw);
      const nameMismatch =
        strictNameConsistency && importedName.trim()
          ? normalizeImportName(importedName) !==
            normalizeImportName(exact.user.name)
          : computeNameMismatch(exact.field, importedName, exact.user.name);
      out.set(key, {
        status: "pending_match",
        entityRef: {
          id: exact.user.id,
          label: exact.user.name,
          email: exact.user.email,
        },
        candidates: extra,
        matchField: exact.field,
        ...(nameMismatch ? { nameMismatch: true } : {}),
      });
      return;
    }
    if (candidates.length > 0) {
      out.set(key, { status: "pending_candidates", candidates });
      return;
    }
    const hasIdentifierValue = orderedSpecs.some((spec) => {
      const raw = row[spec.colIndex];
      return raw != null && String(raw).trim() !== "";
    });
    out.set(key, { status: hasIdentifierValue ? "new" : "idle" });
  });

  return out;
}

export function resolveRowUserResolution(
  resolution: Map<string, CellResolution>,
  rowId: string,
  mapping: Record<string, number>,
): CellResolution | undefined {
  for (const field of ["email", "name", "alternative_name"] as const) {
    if (mapping[field] == null) continue;
    const cell = resolution.get(cellKey(rowId, field));
    if (cell && cell.status !== "idle") return cell;
  }
  return resolution.get(cellKey(rowId, "email"));
}

export function confirmUserMatch(cell: CellResolution): CellResolution {
  if (cell.status !== "pending_match" || !cell.entityRef) return cell;
  return { ...cell, status: "confirmed", confirmedUserId: cell.entityRef.id };
}

export function rejectUserMatch(_cell: CellResolution): CellResolution {
  return { status: "new" };
}

export function ignoreUserRow(): CellResolution {
  return { status: "ignored" };
}

export function unignoreUserRow(): CellResolution {
  return { status: "new" };
}

export function pickRosterStudent(
  cell: CellResolution,
  user: { id: number; name: string; email?: string },
): CellResolution {
  return {
    ...cell,
    status: "confirmed",
    entityRef: {
      id: user.id,
      label: user.name,
      ...(user.email ? { email: user.email } : {}),
    },
    confirmedUserId: user.id,
    matchField: "manual",
  };
}

export function pickUserCandidate(
  cell: CellResolution,
  userId: number,
): CellResolution {
  const chosen = cell.candidates?.find((c) => c.user.id === userId);
  if (!chosen) return cell;
  return {
    ...cell,
    status: "confirmed",
    entityRef: {
      id: chosen.user.id,
      label: chosen.user.name,
      email: chosen.user.email,
    },
    confirmedUserId: chosen.user.id,
  };
}

export function confirmAllExactMatches(
  resolution: Map<string, CellResolution>,
): Map<string, CellResolution> {
  const next = new Map(resolution);
  next.forEach((cell, key) => {
    if (cell.status === "pending_match" && !cell.nameMismatch) {
      next.set(key, confirmUserMatch(cell));
    }
  });
  return next;
}

export function hasUnresolvedUserMatches(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
): boolean {
  for (const rowId of rowIds) {
    const cell = resolution.get(cellKey(rowId, "email"));
    if (cell?.status === "pending_match" || cell?.status === "pending_candidates") {
      return true;
    }
  }
  return false;
}

import { highestPriorityIdentifierField } from "@/lib/mark-sheets/column-map-role";

function resolveCountField(mapping?: Record<string, number>): string {
  if (mapping) {
    return highestPriorityIdentifierField(mapping) ?? "email";
  }
  return "email";
}

export function countPendingExactMatches(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
  mapping?: Record<string, number>,
): number {
  const field = resolveCountField(mapping);
  let n = 0;
  for (const rowId of rowIds) {
    const cell = resolution.get(cellKey(rowId, field));
    if (cell?.status === "pending_match" && !cell.nameMismatch) n += 1;
  }
  return n;
}

export function countPendingNameMismatches(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
  mapping?: Record<string, number>,
): number {
  const field = resolveCountField(mapping);
  let n = 0;
  for (const rowId of rowIds) {
    const cell = resolution.get(cellKey(rowId, field));
    if (cell?.status === "pending_match" && cell.nameMismatch) n += 1;
  }
  return n;
}

export function countPendingFuzzyMatches(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
  mapping?: Record<string, number>,
): number {
  const field = resolveCountField(mapping);
  let n = 0;
  for (const rowId of rowIds) {
    if (resolution.get(cellKey(rowId, field))?.status === "pending_candidates") {
      n += 1;
    }
  }
  return n;
}

const WORST_ORDER: Record<string, number> = {
  linked: 0,
  none: 1,
  needs_attention: 2,
  resolving: 3,
};

export function cellStatusFromTokens(tokens: CourseToken[]): CellStatus {
  let worst: CourseToken["status"] = "linked";
  for (const t of tokens) {
    if ((WORST_ORDER[t.status] ?? 0) > (WORST_ORDER[worst] ?? 0)) worst = t.status;
  }
  if (worst === "needs_attention" || worst === "none") return "needs_attention";
  if (worst === "resolving") return "resolving";
  return "linked";
}

export function buildCourseResolutions(
  rows: (string | number | null)[][],
  colIndex: number,
  rowIds: string[],
  courseMap: Record<string, CourseResolution>,
): Map<string, CellResolution> {
  const out = new Map<string, CellResolution>();
  rows.forEach((row, i) => {
    const tokensRaw = splitCourseTokens(row[colIndex]);
    const key = cellKey(rowIds[i], "courses");
    if (tokensRaw.length === 0) {
      out.set(key, { status: "idle", tokens: [] });
      return;
    }
    const tokens: CourseToken[] = tokensRaw.map((raw) => {
      const r = courseMap[raw];
      if (!r) {
        return { raw, status: "resolving", match: null, candidates: [] };
      }
      return {
        raw,
        status: r.status,
        match: r.match ? { id: r.match.id, title: r.match.title } : null,
        candidates: r.candidates,
        origin: r.status === "linked" ? "auto" : undefined,
      };
    });
    out.set(key, { status: cellStatusFromTokens(tokens), tokens });
  });
  return out;
}

export type UnresolvedTokenGroup = {
  raw: string;
  count: number;
  candidates: CourseCandidate[];
};

export type CourseConflict = { raw: string; titles: string[]; rowIds: string[] };

export function isCourseTokenResolved(t: CourseToken): boolean {
  if (t.status === "linked") return true;
  if (t.status === "none" && t.origin === "manual") return true;
  return false;
}

function eachCourseToken(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
  fn: (token: CourseToken, rowId: string) => void,
) {
  for (const rowId of rowIds) {
    const cell = resolution.get(cellKey(rowId, "courses"));
    cell?.tokens?.forEach((t) => fn(t, rowId));
  }
}

export function collectUnresolvedCourseTokens(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
): UnresolvedTokenGroup[] {
  const groups = new Map<string, UnresolvedTokenGroup>();
  eachCourseToken(resolution, rowIds, (t) => {
    if (t.status === "resolving" || isCourseTokenResolved(t)) return;
    const g = groups.get(t.raw);
    if (g) g.count += 1;
    else groups.set(t.raw, { raw: t.raw, count: 1, candidates: t.candidates });
  });
  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

export function computeCourseProgress(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
): { resolved: number; total: number } {
  const resolvedByRaw = new Map<string, boolean>();
  eachCourseToken(resolution, rowIds, (t) => {
    if (t.status === "resolving") return;
    const prev = resolvedByRaw.get(t.raw);
    const ok = isCourseTokenResolved(t);
    resolvedByRaw.set(t.raw, prev === undefined ? ok : prev && ok);
  });
  let resolved = 0;
  resolvedByRaw.forEach((ok) => {
    if (ok) resolved += 1;
  });
  return { resolved, total: resolvedByRaw.size };
}

export function detectCourseConflicts(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
): CourseConflict[] {
  const byRaw = new Map<
    string,
    Map<number, { title: string; rowIds: string[] }>
  >();
  eachCourseToken(resolution, rowIds, (t, rowId) => {
    if (t.status !== "linked" || !t.match) return;
    let ids = byRaw.get(t.raw);
    if (!ids) {
      ids = new Map();
      byRaw.set(t.raw, ids);
    }
    const entry = ids.get(t.match.id);
    if (entry) entry.rowIds.push(rowId);
    else ids.set(t.match.id, { title: t.match.title, rowIds: [rowId] });
  });
  const out: CourseConflict[] = [];
  byRaw.forEach((ids, raw) => {
    if (ids.size < 2) return;
    const titles: string[] = [];
    const rows: string[] = [];
    ids.forEach((v) => {
      titles.push(v.title);
      rows.push(...v.rowIds);
    });
    out.push({ raw, titles, rowIds: rows });
  });
  return out;
}

export function propagateCoursePick(
  resolution: Map<string, CellResolution>,
  _rows: (string | number | null)[][],
  _coursesColIndex: number,
  rowIds: string[],
  sourceRowId: string,
  tokenRaw: string,
  choice: { id: number; title: string } | null,
): {
  next: Map<string, CellResolution>;
  affected: string[];
  snapshot: Map<string, CellResolution>;
} {
  const next = new Map(resolution);
  const snapshot = new Map<string, CellResolution>();
  const affected: string[] = [];

  const applyToCell = (rowId: string, origin: TokenOrigin) => {
    const key = cellKey(rowId, "courses");
    const cell = next.get(key);
    if (!cell?.tokens?.length) return;
    let changed = false;
    const tokens = cell.tokens.map((t) => {
      if (t.raw !== tokenRaw) return t;
      if (origin === "propagated" && t.origin === "manual") return t;
      changed = true;
      if (!choice) return { ...t, status: "none" as const, match: null, origin };
      return {
        ...t,
        status: "linked" as const,
        match: choice,
        candidates: [],
        origin,
      };
    });
    if (!changed) return;
    snapshot.set(key, cell);
    next.set(key, { status: cellStatusFromTokens(tokens), tokens });
    affected.push(rowId);
  };

  applyToCell(sourceRowId, "manual");

  if (choice) {
    for (const rowId of rowIds) {
      if (rowId === sourceRowId) continue;
      applyToCell(rowId, "propagated");
    }
  }

  return { next, affected, snapshot };
}

export type DuplicateEmailStrategy = "keep_first" | "keep_last" | "merge";

function normalizeEmailForDedup(
  value: string | number | null | undefined,
): string {
  return value == null ? "" : String(value).trim().toLowerCase();
}

export function groupDuplicateEmails(
  rows: (string | number | null)[][],
  colIndex: number,
): Map<string, number[]> {
  const counts = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const email = normalizeEmailForDedup(row[colIndex]);
    if (!email) return;
    const arr = counts.get(email) ?? [];
    arr.push(i);
    counts.set(email, arr);
  });
  const dupes = new Map<string, number[]>();
  counts.forEach((indices, email) => {
    if (indices.length > 1) dupes.set(email, indices);
  });
  return dupes;
}

export type DuplicateEmailResolution = {
  keptRowIndices: Set<number>;
  skippedRowIndices: Set<number>;
  mergedCourseIdsByRow: Map<number, number[]>;
  duplicateGroups: Map<string, number[]>;
  keptRowByEmail: Map<string, number>;
};

function collectLinkedCourseIds(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
  rowIndex: number,
): number[] {
  const cell = resolution.get(cellKey(rowIds[rowIndex], "courses"));
  if (!cell?.tokens) return [];
  return cell.tokens
    .filter((t) => t.status === "linked" && t.match)
    .map((t) => t.match!.id);
}

export function resolveDuplicateEmails(input: {
  strategy: DuplicateEmailStrategy;
  rows: (string | number | null)[][];
  emailColIndex: number;
  rowIds: string[];
  resolution: Map<string, CellResolution>;
}): DuplicateEmailResolution {
  const { strategy, rows, emailColIndex, rowIds, resolution } = input;
  const duplicateGroups = groupDuplicateEmails(rows, emailColIndex);

  const keptRowIndices = new Set<number>();
  const skippedRowIndices = new Set<number>();
  const mergedCourseIdsByRow = new Map<number, number[]>();
  const keptRowByEmail = new Map<string, number>();

  const allDuplicateRowIndices = new Set<number>();
  duplicateGroups.forEach((indices) => {
    indices.forEach((i) => allDuplicateRowIndices.add(i));
  });

  for (let i = 0; i < rows.length; i += 1) {
    if (!allDuplicateRowIndices.has(i)) {
      keptRowIndices.add(i);
    }
  }

  duplicateGroups.forEach((indices, email) => {
    const sorted = [...indices].sort((a, b) => a - b);
    const kept =
      strategy === "keep_last" ? sorted[sorted.length - 1] : sorted[0];
    const toSkip = sorted.filter((i) => i !== kept);

    keptRowIndices.add(kept);
    keptRowByEmail.set(email, kept);
    toSkip.forEach((i) => skippedRowIndices.add(i));

    if (strategy === "merge") {
      const allCourseIds = new Set<number>();
      sorted.forEach((rowIndex) => {
        collectLinkedCourseIds(resolution, rowIds, rowIndex).forEach((id) =>
          allCourseIds.add(id),
        );
      });
      const keptCourses = new Set(
        collectLinkedCourseIds(resolution, rowIds, kept),
      );
      const extra: number[] = [];
      allCourseIds.forEach((id) => {
        if (!keptCourses.has(id)) extra.push(id);
      });
      if (extra.length > 0) {
        mergedCourseIdsByRow.set(kept, extra);
      }
    }
  });

  return {
    keptRowIndices,
    skippedRowIndices,
    mergedCourseIdsByRow,
    duplicateGroups,
    keptRowByEmail,
  };
}

export function findDuplicateEmailRows(
  rows: (string | number | null)[][],
  colIndex: number,
): Set<number> {
  const dupes = new Set<number>();
  groupDuplicateEmails(rows, colIndex).forEach((indices) => {
    indices.forEach((idx) => dupes.add(idx));
  });
  return dupes;
}

export function applyCoursePick(
  cell: CellResolution,
  tokenRaw: string,
  choice: { id: number; title: string } | null,
): CellResolution {
  const tokens = (cell.tokens ?? []).map((t) => {
    if (t.raw !== tokenRaw) return t;
    if (!choice) return { ...t, status: "none" as const, match: null };
    return {
      ...t,
      status: "linked" as const,
      match: choice,
      candidates: [],
    };
  });
  return { status: cellStatusFromTokens(tokens), tokens };
}
