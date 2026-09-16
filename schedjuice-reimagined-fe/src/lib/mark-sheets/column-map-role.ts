import type { RubricColumnKind } from "@/types/mark-sheets";

export type ColumnMapRole =
  | "ignore"
  | "name"
  | "alternative_name"
  | "email"
  | "score";

export const COLUMN_MAP_ROLE_LABELS: Record<ColumnMapRole, string> = {
  ignore: "Ignore",
  name: "Name",
  alternative_name: "Alternative name",
  email: "Email",
  score: "Score",
};

const COLUMN_MAP_ROLE_SET = new Set<string>(Object.keys(COLUMN_MAP_ROLE_LABELS));

export function isValidColumnMapRole(value: unknown): value is ColumnMapRole {
  return typeof value === "string" && COLUMN_MAP_ROLE_SET.has(value);
}

/** Coerce API/paste mapping indices (may be strings) to numbers. */
export function normalizeColumnMapping(
  mapping: Record<string, number | string | null | undefined>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(mapping)) {
    if (val == null || val === "") continue;
    const index = typeof val === "number" ? val : Number.parseInt(String(val), 10);
    if (Number.isFinite(index)) out[key] = index;
  }
  return out;
}

export function columnMapRoleToKind(role: ColumnMapRole): RubricColumnKind {
  if (role === "ignore") return "ignored";
  if (role === "score") return "score";
  return "identifier";
}

export function kindToDefaultColumnMapRole(
  kind: RubricColumnKind | undefined,
  mapping: Record<string, number | string | null | undefined>,
  colIndex: number,
): ColumnMapRole {
  const map = normalizeColumnMapping(mapping);
  if (!kind || kind === "ignored") return "ignore";
  if (kind === "score") return "score";
  if (kind === "computed_total") return "ignore";
  if (map.name === colIndex) return "name";
  if (map.alternative_name === colIndex) return "alternative_name";
  if (map.email === colIndex) return "email";
  return "ignore";
}

export function resolveColumnMapRole(
  colIndex: number,
  columnRoles: Record<number, ColumnMapRole | undefined>,
  kind: RubricColumnKind | undefined,
  mapping: Record<string, number | string | null | undefined>,
): ColumnMapRole {
  const fromState = columnRoles[colIndex];
  if (isValidColumnMapRole(fromState)) return fromState;
  return kindToDefaultColumnMapRole(kind, mapping, colIndex);
}

export function applyColumnMapRole(
  role: ColumnMapRole,
  colIndex: number,
  mapping: Record<string, number | string | null | undefined>,
): Record<string, number> {
  const next = normalizeColumnMapping(mapping);
  for (const key of Object.keys(next)) {
    if (next[key] === colIndex) {
      delete next[key];
    }
  }
  if (role === "name") next.name = colIndex;
  else if (role === "alternative_name") next.alternative_name = colIndex;
  else if (role === "email") next.email = colIndex;
  return next;
}

export function mappingFieldForRole(role: ColumnMapRole): string | null {
  switch (role) {
    case "name":
      return "name";
    case "alternative_name":
      return "alternative_name";
    case "email":
      return "email";
    default:
      return null;
  }
}

export function isUserLinkRole(role: ColumnMapRole): boolean {
  return role === "name" || role === "alternative_name" || role === "email";
}

export const IDENTIFIER_MATCH_FIELDS = ["email", "name", "alternative_name"] as const;
export const IDENTIFIER_MATCH_PRIORITY = ["email", "name", "alternative_name"] as const;

export function countIdentifierColumns(
  mapping: Record<string, number | string | null | undefined>,
): number {
  const map = normalizeColumnMapping(mapping);
  return IDENTIFIER_MATCH_FIELDS.filter((field) => map[field] != null).length;
}

export function highestPriorityIdentifierField(
  mapping: Record<string, number | string | null | undefined>,
): (typeof IDENTIFIER_MATCH_PRIORITY)[number] | null {
  const map = normalizeColumnMapping(mapping);
  return IDENTIFIER_MATCH_PRIORITY.find((field) => map[field] != null) ?? null;
}

export function shouldRematchOnRoleChange(
  prevMapping: Record<string, number | string | null | undefined>,
  changedColIndex: number,
  nextMapping: Record<string, number | string | null | undefined>,
  newRole: ColumnMapRole,
): boolean {
  const prev = normalizeColumnMapping(prevMapping);
  const next = normalizeColumnMapping(nextMapping);
  const prevCount = countIdentifierColumns(prev);
  const count = countIdentifierColumns(next);
  if (count === 0) return false;

  const touchesHighestPriority = (): boolean => {
    const highest = highestPriorityIdentifierField(next);
    if (!highest) return false;
    if (next[highest] === changedColIndex) return true;
    const prevHighest = highestPriorityIdentifierField(prev);
    if (prevHighest && prev[prevHighest] === changedColIndex) return true;
    const newField = mappingFieldForRole(newRole);
    return newField === highest;
  };

  if (count > 1) return touchesHighestPriority();
  if (prevCount <= 1) return true;
  return touchesHighestPriority();
}
