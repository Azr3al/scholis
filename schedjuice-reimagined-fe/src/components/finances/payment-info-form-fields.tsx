"use client";

import EntityCombobox from "@/components/form/entity-combobox";
import type {
  AutoFormInputComponentProps,
  FieldConfigItem,
} from "@/components/auto-form";
import { Field } from "@/components/primitives";
import { listToApiArray } from "@/helpers/filter-params";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";

export const STAFF_ROLE_FILTER = {
  filter_params: [
    {
      field_name: "roles",
      operator: operatorEnum.contained_by,
      value: listToApiArray([
        role.superadmin,
        role.admin,
        role.manager,
        role.teacher,
        role.finance,
        role.hr,
      ]),
    },
  ],
};

/**
 * Shared field config for payment-info create and edit (new auto-form).
 */
export function buildPaymentInfoFieldConfig(options?: {
  staffUserId?: number;
  lockStaff?: boolean;
}): Record<string, FieldConfigItem> {
  const { staffUserId, lockStaff } = options ?? {};

  return {
    user: {
      description:
        "Teacher or staff member who will receive payouts through this account.",
      fieldType: ({
        field,
        label,
        isRequired,
        fieldConfigItem,
        error,
      }: AutoFormInputComponentProps) => (
        <Field.Root
          className="w-full max-w-xl"
          name={field.name}
          invalid={Boolean(error)}
        >
          <Field.Label>
            {label}
            {isRequired ? <span className="text-danger"> *</span> : null}
          </Field.Label>
          <EntityCombobox
            label=""
            entity="users"
            displayFunction={(u) => `${u.name} (${u.email})`}
            value={
              field.value
                ? String(field.value)
                : staffUserId
                  ? String(staffUserId)
                  : undefined
            }
            onChange={(v) => field.onChange(v ? Number(v) : undefined)}
            disabled={lockStaff}
            comboboxPlaceholder="Search staff member…"
            allowDeselect={!isRequired}
            queryParams={{
              fields: ["id", "name", "email"],
              sorts: ["name"],
              size: -1,
            }}
            filterParams={STAFF_ROLE_FILTER}
          />
          {fieldConfigItem.description ? (
            <Field.Description>{fieldConfigItem.description}</Field.Description>
          ) : null}
          {/* Reserved min-h matches built-in FieldMessage — no layout shift. */}
          <div className="min-h-5">
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </Field.Root>
      ),
    },
    account_name: {
      description: "Name on the bank or mobile wallet account.",
      inputProps: {
        required: true,
      },
    },
    bank_type: {
      description: "Mobile wallet or bank used for this payout method.",
      inputProps: {
        required: true,
      },
    },
    description: {
      description:
        "Bank account or mobile wallet number. Not required for cash payouts.",
      inputProps: {
        required: false,
      },
    },
    is_default: {
      description:
        "Only one payment method can be default per person. Setting this replaces any existing default.",
    },
  };
}
