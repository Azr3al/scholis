import type { AxiosResponse } from "axios";

import type {
  CustomFieldDefinitionDto,
  FieldFilledBy,
  FieldRequiredAt,
  FieldSource,
} from "@/types/custom-fields";
import { CUSTOM_FIELD_ENTITY_USER } from "@/types/custom-fields";

function asSource(v: unknown): FieldSource {
  return v === "builtin" ? "builtin" : "custom";
}

function asRequiredAt(v: unknown): FieldRequiredAt {
  return v === "registration" || v === "profile_completion" ? v : "never";
}

function asFilledBy(v: unknown): FieldFilledBy {
  return v === "user" || v === "admin" ? v : "both";
}

/** Unwrap list rows from GET list responses (handles minor shape differences). */
export function extractCustomFieldDefinitionRows(
  res: AxiosResponse<unknown>
): unknown[] {
  const root = res.data as Record<string, unknown> | null | undefined;
  if (!root || root.isError === true) return [];

  const first = root.data;
  if (Array.isArray(first)) return first;
  if (
    first &&
    typeof first === "object" &&
    Array.isArray((first as Record<string, unknown>).data)
  ) {
    return (first as { data: unknown[] }).data;
  }
  return [];
}

/** Map API row to DTO. Expects Django/DRF snake_case keys only. */
export function normalizeCustomFieldDefinitionRow(
  raw: unknown
): CustomFieldDefinitionDto | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id;
  if (typeof id !== "number") return null;

  const entity_type =
    typeof r.entity_type === "string" && r.entity_type.length > 0
      ? r.entity_type
      : CUSTOM_FIELD_ENTITY_USER;

  if (typeof r.field_key !== "string" || typeof r.field_label !== "string") {
    return null;
  }
  if (typeof r.field_type !== "string") return null;

  const formRaw = r.form_input_mode;
  const form_input_mode =
    formRaw === "read_only" || formRaw === "editable" ? formRaw : "editable";

  return {
    id,
    source: asSource(r.source),
    entity_type,
    field_key: r.field_key,
    field_label: r.field_label,
    field_type: r.field_type,
    is_required: Boolean(r.is_required),
    is_filterable: Boolean(r.is_filterable),
    sort_order: (() => {
      const so = r.sort_order;
      if (typeof so === "number" && Number.isFinite(so)) return so;
      const n = Number(so ?? 0);
      return Number.isFinite(n) ? n : 0;
    })(),
    choices: (r.choices as CustomFieldDefinitionDto["choices"]) ?? null,
    validation_rules:
      (r.validation_rules as CustomFieldDefinitionDto["validation_rules"]) ??
      null,
    description: typeof r.description === "string" ? r.description : "",
    is_active: r.is_active !== false,
    required_at: asRequiredAt(r.required_at),
    roles: Array.isArray(r.roles) ? (r.roles as string[]) : [],
    filled_by: asFilledBy(r.filled_by),
    group: typeof r.group === "number" ? r.group : null,
    show_on_create: r.show_on_create !== false,
    show_on_edit: r.show_on_edit !== false,
    show_on_detail: r.show_on_detail !== false,
    form_input_mode,
  };
}
