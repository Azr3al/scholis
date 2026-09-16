export type FieldSaveState = "saving" | "saved" | "error";
export type FormSaveStatus = "idle" | "saving" | "saved" | "error";

type CollectInput = {
  dirtyFields: Record<string, boolean>;
  invalidFields: ReadonlyArray<string>;
};

/** Names of fields that are dirty AND not currently invalid, sorted for determinism. */
export function collectDirtyValidFields(input: CollectInput): string[] {
  const invalid = new Set(input.invalidFields);
  return Object.keys(input.dirtyFields)
    .filter((name) => input.dirtyFields[name] && !invalid.has(name))
    .sort();
}

/** Build a flat payload picking the given field names from values. */
export function buildDiffPayload(
  values: Record<string, unknown>,
  fieldNames: ReadonlyArray<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of fieldNames) {
    out[name] = values[name];
  }
  return out;
}

/** Fields that must flush together when `blurredField` blurs. */
export function fieldsForFlush(
  blurredField: string,
  units: ReadonlyArray<ReadonlyArray<string>> = [],
): string[] {
  const unit = units.find((u) => u.includes(blurredField));
  return unit ? [...unit] : [blurredField];
}

/**
 * Whether a unit may flush: focus has left the whole unit (activeField not in
 * the unit) AND none of the unit's fields are invalid.
 */
export function isUnitReady(
  unitFields: ReadonlyArray<string>,
  activeField: string | null,
  invalidFields: ReadonlyArray<string>,
): boolean {
  if (activeField && unitFields.includes(activeField)) return false;
  const invalid = new Set(invalidFields);
  return !unitFields.some((f) => invalid.has(f));
}

/** Roll a per-field status map up into a single form-level status. */
export function deriveFormStatus(
  fieldStatus: Record<string, FieldSaveState>,
): FormSaveStatus {
  const states = Object.values(fieldStatus);
  if (states.includes("error")) return "error";
  if (states.includes("saving")) return "saving";
  if (states.includes("saved")) return "saved";
  return "idle";
}

/**
 * Merge a partial diff into a cached entity object immutably.
 * Cache shape from fetchEntity is { data: { data: <entity> } }.
 */
export function mergeEntityDiff<
  T extends { data?: { data?: Record<string, unknown> } },
>(cache: T, diff: Record<string, unknown>): T {
  if (!cache?.data?.data) return cache;
  return {
    ...cache,
    data: {
      ...cache.data,
      data: { ...cache.data.data, ...diff },
    },
  };
}

/**
 * Map Zod-style issue paths to the candidate field names that are invalid.
 * Uses the first path segment (top-level field). De-duplicated, order = `fields`.
 */
export function invalidFieldsFromIssues(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>,
  fields: ReadonlyArray<string>,
): string[] {
  const bad = new Set<string>();
  for (const issue of issues) {
    const head = issue.path[0];
    if (typeof head === "string") bad.add(head);
  }
  return fields.filter((f) => bad.has(f));
}
