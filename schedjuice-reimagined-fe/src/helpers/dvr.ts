import { getPropertyPaths } from "@/helpers/getPropertyPaths";
import { STAFF_ROLES } from "@/helpers/role";
import type { CustomFieldDefinitionDto } from "@/types/custom-fields";
import {
  EMPTY_FORM_CONFIG,
  type FormConfig,
  type FormConfigField,
} from "@/types/form-config";
import { dvrFieldSchema, role, type accountType } from "@/types/user";

export type DvrFieldConfig = { name: string; required: boolean };

/** Empty stub account for create-page preview (never persisted). */
export const DVR_PREVIEW_STUB_USER = {
  id: 0,
  email: "preview@example.com",
  communication_email: "",
  name: "",
  password: "",
  roles: [role.teacher],
  phone_number: "",
  is_password_change_required: false,
  custom_data: {},
} as unknown as accountType;

export const DVR_STAFF_ROLE_DEFAULTS = [...STAFF_ROLES] as string[];

export const DVR_BUILTIN_FIELD_NAMES = [
  "communication_email",
  "alternative_name",
  "date_of_birth",
  "phone_number",
  "house_number",
  "street",
  "township",
  "city",
  "region",
  "country",
] as const;

const BUILTIN_SET = new Set<string>(DVR_BUILTIN_FIELD_NAMES);

export function isDvrBuiltinField(name: string): boolean {
  return BUILTIN_SET.has(name);
}

export function normalizeDvrFields(raw: unknown): DvrFieldConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") {
        return { name: item, required: false };
      }
      if (item && typeof item === "object" && "name" in item) {
        const name = String((item as { name: unknown }).name);
        const required = Boolean((item as { required?: unknown }).required);
        return { name, required };
      }
      return null;
    })
    .filter((x): x is DvrFieldConfig => x != null);
}

export function defaultDvrFieldConfigs(): DvrFieldConfig[] {
  return getPropertyPaths(dvrFieldSchema).map((name) => ({
    name,
    required: false,
  }));
}

export function mergeCustomFieldDefaults(
  selected: DvrFieldConfig[],
  customKeys: string[],
): DvrFieldConfig[] {
  const have = new Set(selected.map((f) => f.name));
  const next = [...selected];
  for (const key of customKeys) {
    if (BUILTIN_SET.has(key)) continue;
    if (have.has(key)) continue;
    next.push({ name: key, required: false });
  }
  return next;
}

/** Include every key; new entries get required:false; existing required flags kept. */
export function selectAllFieldKeys(
  selected: DvrFieldConfig[],
  keys: readonly string[],
): DvrFieldConfig[] {
  const byName = new Map(selected.map((f) => [f.name, f]));
  const next = [...selected];
  for (const key of keys) {
    if (byName.has(key)) continue;
    const entry = { name: key, required: false };
    next.push(entry);
    byName.set(key, entry);
  }
  return next;
}

/** Remove entries whose name is in keys; leave other selections untouched. */
export function clearFieldKeys(
  selected: DvrFieldConfig[],
  keys: readonly string[],
): DvrFieldConfig[] {
  const remove = new Set(keys);
  return selected.filter((f) => !remove.has(f.name));
}

export function pendingUserDvrsQueryKey(userId: number | string | undefined) {
  return ["pending-user-dvrs", userId] as const;
}

export function orderDvrFieldsLikeCatalog(
  fields: DvrFieldConfig[],
  customKeysInCatalogOrder: string[] = [],
): DvrFieldConfig[] {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const out: DvrFieldConfig[] = [];
  const seen = new Set<string>();

  for (const name of DVR_BUILTIN_FIELD_NAMES) {
    const cfg = byName.get(name);
    if (!cfg) continue;
    out.push(cfg);
    seen.add(name);
  }
  for (const key of customKeysInCatalogOrder) {
    if (seen.has(key) || BUILTIN_SET.has(key)) continue;
    const cfg = byName.get(key);
    if (!cfg) continue;
    out.push(cfg);
    seen.add(key);
  }
  for (const f of fields) {
    if (seen.has(f.name)) continue;
    out.push(f);
    seen.add(f.name);
  }
  return out;
}

export function resolveDvrVerifyFields(
  rawFields: unknown,
  activeCustomKeys: Set<string>,
  customKeysInCatalogOrder: string[] = [],
): { builtins: DvrFieldConfig[]; customs: DvrFieldConfig[] } {
  const configs = orderDvrFieldsLikeCatalog(
    normalizeDvrFields(rawFields),
    customKeysInCatalogOrder,
  );
  const builtins: DvrFieldConfig[] = [];
  const customs: DvrFieldConfig[] = [];
  for (const c of configs) {
    if (isDvrBuiltinField(c.name)) builtins.push(c);
    else if (activeCustomKeys.has(c.name)) customs.push(c);
  }
  return { builtins, customs };
}

/** Map a field definition into the shape FieldRenderer / form-config expect. */
export function definitionToFormConfigField(
  def: CustomFieldDefinitionDto,
): FormConfigField {
  return {
    id: def.id,
    source: def.source === "builtin" ? "builtin" : "custom",
    fieldKey: def.field_key,
    fieldLabel: def.field_label || def.field_key,
    fieldType: def.field_type,
    choices: def.choices,
    description: def.description ?? "",
    requiredAt: def.required_at,
    filledBy: def.filled_by,
    isFilterable: def.is_filterable,
    sortOrder: def.sort_order,
    validationRules: def.validation_rules,
    groupId: def.group,
  };
}

/**
 * Build the verify/preview form-config for DVR-selected custom fields.
 *
 * Edit form-config is filtered by `show_on_edit` and role intersection, but the
 * DVR create picker ignores those flags. Prefer form-config entries when present;
 * otherwise synthesize from active definitions so selected customs still render.
 */
export function buildDvrCustomFormConfig(
  formConfig: FormConfig,
  customs: DvrFieldConfig[],
  definitions: CustomFieldDefinitionDto[],
): FormConfig {
  if (customs.length === 0) {
    return { ...formConfig, groups: [] };
  }

  const fromConfig = new Map<string, FormConfigField>();
  for (const g of formConfig.groups) {
    for (const f of g.fields) {
      fromConfig.set(f.fieldKey, f);
    }
  }
  const fromDefs = new Map(
    definitions.map((d) => [d.field_key, definitionToFormConfigField(d)]),
  );

  const fields = customs
    .map((c) => fromConfig.get(c.name) ?? fromDefs.get(c.name))
    .filter((f): f is FormConfigField => f != null);

  if (fields.length === 0) {
    return { ...formConfig, groups: [] };
  }

  return {
    ...formConfig,
    entityType: formConfig.entityType || EMPTY_FORM_CONFIG.entityType,
    surface: formConfig.surface || "edit",
    groups: [{ id: null, name: "", sortOrder: 0, fields }],
  };
}

function toLocalIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function defaultDvrExpiresOn(today: Date = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() + 14);
  return toLocalIsoDate(d);
}

export function includedFieldNames(fields: DvrFieldConfig[]): string[] {
  return fields.map((f) => f.name);
}

export function requiredFieldNames(fields: DvrFieldConfig[]): string[] {
  return fields.filter((f) => f.required).map((f) => f.name);
}

export type BannerUserDvr = {
  id: number;
  status: string;
  data_verification_request?: {
    id: number;
    name?: string;
    expires_on?: string | null;
  } | null;
};

export function pickBannerUserDvr(
  rows: BannerUserDvr[],
  today: Date = new Date(),
): BannerUserDvr | null {
  const todayStr = toLocalIsoDate(today);

  const eligible = rows.filter((row) => {
    if (row.status !== "pending") return false;
    const exp = row.data_verification_request?.expires_on;
    if (!exp) return false;
    return exp >= todayStr;
  });
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => {
    const ae = a.data_verification_request!.expires_on!;
    const be = b.data_verification_request!.expires_on!;
    if (ae !== be) return ae < be ? -1 : 1;
    return a.id - b.id;
  });
  return eligible[0] ?? null;
}
