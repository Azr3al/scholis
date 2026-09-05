import { fieldFormPath } from "@/lib/custom-fields/field-policy";
import type { CompletionAudience, MissingField } from "@/types/completion";
import type {
  FieldFilledBy,
  FormConfig,
  FormConfigField,
} from "@/types/form-config";

function isBlankSubmitValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function valueAtFieldPath(
  formValues: Record<string, unknown>,
  field: FormConfigField,
): unknown {
  const incomingCustom = (formValues.custom_data ?? {}) as Record<string, unknown>;
  const nested = incomingCustom[field.fieldKey];
  if (!isBlankSubmitValue(nested)) return nested;
  const path = fieldFormPath(field);
  if (path === field.fieldKey) return formValues[field.fieldKey];
  const parts = path.split(".");
  let current: unknown = formValues;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

const AUDIENCE_FILLED_BY: Record<CompletionAudience, Set<FieldFilledBy>> = {
  user: new Set<FieldFilledBy>(["user", "both"]),
  admin: new Set<FieldFilledBy>(["admin", "both"]),
};

/** Field keys from `missing[]` that the given audience is responsible for. */
export function missingKeysForAudience(
  missing: MissingField[],
  audience: CompletionAudience,
): Set<string> {
  const allowed = AUDIENCE_FILLED_BY[audience];
  return new Set(
    missing.filter((m) => allowed.has(m.filled_by)).map((m) => m.field_key),
  );
}

/** Narrow a form-config to only the fields whose key is in `keys`; drop empty groups. */
export function filterConfigToKeys(
  config: FormConfig,
  keys: Set<string>,
): FormConfig {
  const groups = config.groups
    .map((g) => ({
      ...g,
      fields: g.fields.filter((f) => keys.has(f.fieldKey)),
    }))
    .filter((g) => g.fields.length > 0);
  return { ...config, groups };
}

/** Label of the first missing field, for the banner's "next up" hint. */
export function nextMissingLabel(missing: MissingField[]): string | null {
  return missing.length ? missing[0].field_label : null;
}

/**
 * Build a save payload for one group's fields: builtin fields at the top level,
 * custom fields nested under custom_data. Only the group's fields are included.
 */
export function collectGroupPayload(
  fields: FormConfigField[],
  formValues: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const customData: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.source === "builtin") {
      const value = valueAtFieldPath(formValues, f);
      if (!isBlankSubmitValue(value)) payload[f.fieldKey] = value;
    } else {
      const value = valueAtFieldPath(formValues, f);
      if (!isBlankSubmitValue(value)) customData[f.fieldKey] = value;
    }
  }
  if (Object.keys(customData).length > 0) payload.custom_data = customData;
  return payload;
}
