import type { FormConfigField } from "@/types/form-config";

const ADDRESS_BUILTIN_KEYS = [
  "country",
  "region",
  "city",
  "township",
  "house_number",
  "street",
] as const;

const ADDRESS_SET = new Set<string>(ADDRESS_BUILTIN_KEYS);

function isAddressBuiltinKey(field: FormConfigField): boolean {
  return field.source === "builtin" && ADDRESS_SET.has(field.fieldKey);
}

export function partitionAddressFields(fields: FormConfigField[]): {
  addressFields: FormConfigField[];
  otherFields: FormConfigField[];
} {
  const addressFields: FormConfigField[] = [];
  const otherFields: FormConfigField[] = [];
  for (const f of fields) {
    (isAddressBuiltinKey(f) ? addressFields : otherFields).push(f);
  }
  return { addressFields, otherFields };
}
