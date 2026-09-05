"use client";
import { Field, Input, Textarea, inputClassName } from "@/components/primitives";
import { DateTimePicker } from "@/components/date/date-time-picker";

import EntityCombobox from "@/components/form/entity-combobox";
import { FormFieldErrorSlot } from "@/components/form/field-error-slot";
import { OptionalMark, RequiredMark } from "@/components/form/required-mark";
import Selector from "@/components/form/selectors/selector";
import { queryParamDefault } from "@/config/defaults";
import { listToApiArray } from "@/helpers/filter-params";
import type { AppointmentInput } from "@/lib/leads-api";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";
import { Controller, type Control } from "react-hook-form";

export const PLATFORM_OPTIONS = [
  { label: "Zoom", value: "ZOOM" },
  { label: "Google Meet", value: "MEET" },
  { label: "In person", value: "IN_PERSON" },
  { label: "Phone", value: "PHONE" },
  { label: "Other", value: "OTHER" },
] as const;

export type AppointmentFormValues = {
  scheduled_at: Date | null;
  platform: AppointmentInput["platform"];
  consultant?: string;
  meeting_link?: string;
  notes?: string;
};

export function AppointmentFormFields({
  control,
}: {
  control: Control<AppointmentFormValues>;
}) {
  return (
    <>
      <Controller
        control={control}
        name="scheduled_at"
        rules={{
          validate: (value) =>
            value instanceof Date && !Number.isNaN(value.getTime())
              ? true
              : "Date and time are required",
        }}
        render={({ field, fieldState }) => (
          <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
            <Field.Label>
              Date & time
              <RequiredMark />
            </Field.Label>
            <DateTimePicker
              date={field.value}
              setDate={field.onChange}
              className="w-full"
            />
            <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
      <Controller
        control={control}
        name="platform"
        rules={{ required: "Platform is required" }}
        render={({ field, fieldState }) => (
          <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
            <Field.Label>
              Platform
              <RequiredMark />
            </Field.Label>
            <Selector
              fullWidth
              showOnlyInlineLable
              className="w-full min-w-0"
              options={PLATFORM_OPTIONS.map((option) => ({
                label: option.label,
                value: option.value,
              }))}
              value={field.value}
              onChange={field.onChange}
            />
            <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
      <Controller
        control={control}
        name="consultant"
        render={({ field, fieldState }) => (
          <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
            <Field.Label>
              Consultant
              <OptionalMark />
            </Field.Label>
            <EntityCombobox
              label=""
              entity="users"
              displayFunction={(user) => user.name}
              value={field.value}
              onChange={field.onChange}
              emptyOption={{ value: "", label: "No consultant" }}
              queryParams={{
                ...queryParamDefault,
                sorts: ["name"],
                fields: ["id", "name"],
                size: -1,
              }}
              filterParams={{
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
              }}
            />
            <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
      <Controller
        control={control}
        name="meeting_link"
        render={({ field, fieldState }) => (
          <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
            <Field.Label>
              Meeting link
              <OptionalMark />
            </Field.Label>
            <Input {...field} placeholder="https://…" />
            <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
      <Controller
        control={control}
        name="notes"
        render={({ field, fieldState }) => (
          <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
            <Field.Label>
              Notes
              <OptionalMark />
            </Field.Label>
            <Textarea
              {...field}
              placeholder="optional"
              className="min-h-[72px] resize-none"
            />
            <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
    </>
  );
}
