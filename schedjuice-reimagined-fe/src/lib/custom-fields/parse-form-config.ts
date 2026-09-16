import {
  EMPTY_FORM_CONFIG,
  type FieldFilledBy,
  type FieldRequiredAt,
  type FieldSource,
  type FormConfig,
  type FormConfigChoice,
  type FormConfigField,
  type FormConfigGroup,
  type FormSurface,
} from "@/types/form-config";

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function asSource(v: unknown): FieldSource {
  return v === "builtin" ? "builtin" : "custom";
}
function asRequiredAt(v: unknown): FieldRequiredAt {
  return v === "registration" || v === "profile_completion" ? v : "never";
}
function asFilledBy(v: unknown): FieldFilledBy {
  return v === "user" || v === "admin" ? v : "both";
}
function asSurface(v: unknown): FormSurface {
  return v === "create" || v === "detail" ? v : "edit";
}
function asChoices(v: unknown): FormConfigChoice[] | null {
  if (!Array.isArray(v)) return null;
  const out: FormConfigChoice[] = [];
  for (const c of v) {
    if (c && typeof c === "object") {
      const value = (c as Record<string, unknown>).value;
      const label = (c as Record<string, unknown>).label;
      if (typeof value === "string") {
        out.push({ value, label: typeof label === "string" ? label : value });
      }
    }
  }
  return out;
}

function parseField(raw: unknown): FormConfigField | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id;
  const fieldKey = r.field_key;
  if (typeof id !== "number") return null;
  if (typeof fieldKey !== "string" || fieldKey.length === 0) return null;
  if (typeof r.field_type !== "string") return null;
  return {
    id,
    source: asSource(r.source),
    fieldKey,
    fieldLabel: asString(r.field_label, fieldKey),
    fieldType: r.field_type,
    choices: asChoices(r.choices),
    description: asString(r.description),
    requiredAt: asRequiredAt(r.required_at),
    filledBy: asFilledBy(r.filled_by),
    isFilterable: Boolean(r.is_filterable),
    sortOrder: asNumber(r.sort_order),
    validationRules:
      r.validation_rules && typeof r.validation_rules === "object"
        ? (r.validation_rules as Record<string, unknown>)
        : null,
    groupId: typeof r.group_id === "number" ? r.group_id : null,
  };
}

function resolveFormConfigPayload(input: Record<string, unknown>): Record<string, unknown> {
  if ("groups" in input) return input;

  const outer = input.data;
  if (outer && typeof outer === "object") {
    const outerRecord = outer as Record<string, unknown>;
    if ("groups" in outerRecord) return outerRecord;

    const inner = outerRecord.data;
    if (inner && typeof inner === "object" && "groups" in (inner as object)) {
      return inner as Record<string, unknown>;
    }
  }

  return input;
}

/** Accepts the API envelope, axios body (`res.data`), or bare `{ groups }` payload. */
export function parseFormConfig(input: unknown): FormConfig {
  if (!input || typeof input !== "object") return EMPTY_FORM_CONFIG;
  const payload = resolveFormConfigPayload(input as Record<string, unknown>);

  const rawGroups = Array.isArray(payload.groups) ? payload.groups : [];
  const groups: FormConfigGroup[] = [];
  for (const rg of rawGroups) {
    if (!rg || typeof rg !== "object") continue;
    const g = rg as Record<string, unknown>;
    const fields = (Array.isArray(g.fields) ? g.fields : [])
      .map(parseField)
      .filter((f): f is FormConfigField => f != null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    groups.push({
      id: typeof g.id === "number" ? g.id : null,
      name: asString(g.name, "General"),
      sortOrder: asNumber(g.sort_order, 1e9),
      fields,
    });
  }
  groups.sort((a, b) => a.sortOrder - b.sortOrder || (a.id ?? 0) - (b.id ?? 0));

  return {
    entityType: asString(payload.entity_type, "app_auth.User"),
    surface: asSurface(payload.surface),
    groups,
  };
}
