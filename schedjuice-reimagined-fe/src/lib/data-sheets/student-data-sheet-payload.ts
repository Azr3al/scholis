import { prepareUserFormPayload } from "@/components/users/user-form-utils";
import type { FormConfigField } from "@/types/form-config";
import type { organizationType } from "@/types/organization";

/** Build a partial PATCH body for a single edited cell. */
export function buildStudentFieldPatch(
  fieldId: string,
  rawValue: string,
  field: FormConfigField | undefined,
  tenant: organizationType | null,
): Record<string, unknown> {
  let formValues: Record<string, unknown>;

  if (fieldId.startsWith("custom_data.")) {
    const key = fieldId.slice("custom_data.".length);
    formValues = {
      custom_data: {
        [key]: rawValue === "" ? null : rawValue,
      },
    };
  } else {
    formValues = {
      [fieldId]: rawValue === "" ? null : rawValue,
    };
  }

  return prepareUserFormPayload(formValues, {
    mode: "edit",
    tenant,
    fields: field ? [field] : undefined,
  });
}
