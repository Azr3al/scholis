"use client";
import { Input, Field } from "@/components/primitives";

import EntityChooserCheckbox from "@/components/auth/entity-chooser-checkbox";
import { UserPublicProfileFields } from "./user-public-profile-fields";
import TimeSelect from "@/components/calendar/time-select";
import { FormFieldErrorSlot } from "@/components/form/field-error-slot";
import { OptionalMark, RequiredMark } from "@/components/form/required-mark";
import Selector from "@/components/form/selectors/selector";
import { DatePicker } from "@/components/users/date-picker";
import { usePermissions } from "@/hooks/usePermissions";
import { stringToTimeValue, timeValueToString } from "@/helpers/date";
import type { organizationType } from "@/types/organization";
import { accountType } from "@/types/user";
import type { FieldMeasure } from "@/lib/ui/field-measure";
import { fieldMeasureClassName } from "@/lib/ui/field-measure";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

export interface UserFormFieldsContext {
  form: UseFormReturn<any>;
  mode: "create" | "edit";
  viewerAccount: accountType;
  subjectUser?: accountType;
  tenant?: organizationType | null;
  measure?: FieldMeasure;
  myanmarAddress: {
    region: string;
    city: string;
    township: string;
  };
  registerPreSubmit?: (fn: () => void) => () => void;
  savePublicProfile?: () => void;
  isSavingPublicProfile?: boolean;
  commitField?: (name: string) => void;
}

function fieldGridClassName(fullWidth?: boolean) {
  return fullWidth ? "md:col-span-2" : undefined;
}

export function UserProfileFields({
  form,
  mode,
  viewerAccount,
  tenant,
}: UserFormFieldsContext) {
  const { can } = usePermissions();
  const nameDisabled = mode === "edit" && !can("user.update");
  const showMicrosoftDisplayName = Boolean(tenant?.is_microsoft_on);
  const msDisplayTouchedRef = useRef(false);
  const watchedName = form.watch("name");

  useEffect(() => {
    if (mode !== "create" || !showMicrosoftDisplayName || msDisplayTouchedRef.current) {
      return;
    }
    form.setValue("microsoft_display_name", watchedName ?? "", {
      shouldValidate: false,
    });
  }, [watchedName, mode, showMicrosoftDisplayName, form]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
            <Field.Label>
              Name
              <RequiredMark />
            </Field.Label>
<Input {...field} disabled={nameDisabled} />
                <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
      {showMicrosoftDisplayName ? (
        <Controller
          control={form.control}
          name="microsoft_display_name"
          render={({ field, fieldState }) => (
            <Field.Root
              className="w-full"
              name={field.name}
              invalid={Boolean(fieldState.error)}
            >
              <Field.Label>Microsoft display name</Field.Label>
              <Input
                {...field}
                value={field.value ?? ""}
                disabled={nameDisabled}
                onChange={(event) => {
                  msDisplayTouchedRef.current = true;
                  field.onChange(event);
                }}
              />
              <Field.Description>
                Shown as this person&apos;s name in Teams and Outlook.
              </Field.Description>
              <FormFieldErrorSlot message={fieldState.error?.message} />
            </Field.Root>
          )}
        />
      ) : null}
      <Controller
        control={form.control}
        name="email"
        render={({ field, fieldState }) => (
          <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
            <Field.Label>
              Email
              <RequiredMark />
            </Field.Label>
<Input {...field} type="email" disabled={mode === "edit"} />
                <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
      <Controller
        control={form.control}
        name="communication_email"
        render={({ field, fieldState }) => (
          <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
            <Field.Label>
              Communication Email
              <RequiredMark />
            </Field.Label>
<Input {...field} type="email" />
                <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
      <Controller
        control={form.control}
        name="phone_number"
        render={({ field, fieldState }) => (
          <Field.Root className="md:col-span-2" name={field.name} invalid={Boolean(fieldState.error)}>
            <Field.Label>
              Phone number
              <RequiredMark />
            </Field.Label>
<Input {...field} />
                <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
    </div>
  );
}

export function UserAccessFields({
  form,
  viewerAccount,
  commitField,
}: UserFormFieldsContext) {
  const { can } = usePermissions();

  return (
    <div className="space-y-4">
      {can("user.assign_roles") ? (
        <Controller
          control={form.control}
          name="roles"
          render={({ field, fieldState }) => (
            <EntityChooserCheckbox
              fieldName="roles"
              userRoles={viewerAccount.roles || []}
              roles={field.value ?? []}
              onRolesChange={(next) => {
                field.onChange(next);
                commitField?.("roles");
              }}
              label="Roles"
              isRequired
            />
          )}
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Controller
          control={form.control}
          name="code"
          render={({ field, fieldState }) => (
            <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
              <Field.Label>
                User ID
                <OptionalMark />
              </Field.Label>
<Input {...field} value={field.value ?? ""} />
<Field.Description>
                Leave blank to auto-assign.
              </Field.Description>
                              <FormFieldErrorSlot message={fieldState.error?.message} />
            </Field.Root>
          )}
        />
      </div>
    </div>
  );
}

export function UserCheckinFields({ form, commitField }: UserFormFieldsContext) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Controller
        control={form.control}
        name="preferred_checkin_time"
        render={({ field, fieldState }) => (
          <Field.Root className="min-w-0 w-full" name={field.name} invalid={Boolean(fieldState.error)}>
            <Field.Label>
              Preferred Check-in Time
              <OptionalMark />
            </Field.Label>
<TimeSelect
                value={field.value ? stringToTimeValue(field.value) : null}
                onChange={(value) => {
                  field.onChange(value ? timeValueToString(value) : "");
                  commitField?.("preferred_checkin_time");
                }}
              />
                <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
      <Controller
        control={form.control}
        name="preferred_checkout_time"
        render={({ field, fieldState }) => (
          <Field.Root className="min-w-0 w-full" name={field.name} invalid={Boolean(fieldState.error)}>
            <Field.Label>
              Preferred Check-out Time
              <OptionalMark />
            </Field.Label>
<TimeSelect
                value={field.value ? stringToTimeValue(field.value) : null}
                onChange={(value) => {
                  field.onChange(value ? timeValueToString(value) : "");
                  commitField?.("preferred_checkout_time");
                }}
              />
                <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
      <Controller
        control={form.control}
        name="access_log_name"
        render={({ field, fieldState }) => (
          <Field.Root
            className="min-w-0 md:col-span-2"
            name={field.name}
            invalid={Boolean(fieldState.error)}
          >
            <Field.Label>
              Name from Access Log
              <OptionalMark />
            </Field.Label>
<Input {...field} value={field.value ?? ""} />
                <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
    </div>
  );
}

export function UserPayrollFields({ form }: UserFormFieldsContext) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(
        [
          ["working_hour_per_month", "Working Hour Per Month"],
          ["salary", "Salary"],
          ["per_session_rate", "Per Session Rate"],
          ["per_hour_rate", "Per Hour Rate"],
          ["student_bonus_hourly_rate", "Student Bonus Hourly Rate"],
        ] as const
      ).map(([name, label]) => (
        <Controller
          key={name}
          control={form.control}
          name={name}
          render={({ field, fieldState }) => (
            <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
              <Field.Label>
                {label}
                <OptionalMark />
              </Field.Label>
<Input
                  type="number"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value === "" ? undefined : e.target.value)
                  }
                />
                <FormFieldErrorSlot message={fieldState.error?.message} />
            </Field.Root>
          )}
        />
      ))}
    </div>
  );
}

export function UserHrFields({ form, commitField }: UserFormFieldsContext) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(
        [
          ["contract_expiry_date", "Contract Expiry Date"],
          ["probation_end_date", "Probation End Date"],
          ["employment_start_date", "Employement Start Date"],
        ] as const
      ).map(([name, label]) => (
        <Controller
          key={name}
          control={form.control}
          name={name}
          render={({ field, fieldState }) => (
            <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
              <Field.Label>
                {label}
                <OptionalMark />
              </Field.Label>
<DatePicker
                  date={field.value ? new Date(field.value) : undefined}
                  setDate={(date) => {
                    field.onChange(date);
                    commitField?.(name);
                  }}
                />
                <FormFieldErrorSlot message={fieldState.error?.message} />
            </Field.Root>
          )}
        />
      ))}
      <Controller
        control={form.control}
        name="employment_type"
        render={({ field, fieldState }) => (
          <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
            <Field.Label>
              Employment Type
              <OptionalMark />
            </Field.Label>
            <Selector
              options={[
                { label: "Part time", value: "part_time" },
                { label: "Full time", value: "full_time" },
                { label: "None", value: "" },
              ]}
              value={field.value ?? ""}
              onChange={(value) => {
                field.onChange(value);
                commitField?.("employment_type");
              }}
              showOnlyInlineLable
              className="w-full min-w-0"
            />
                            <FormFieldErrorSlot message={fieldState.error?.message} />
          </Field.Root>
        )}
      />
    </div>
  );
}

export function UserZoomFields({ form }: UserFormFieldsContext) {
  return (
    <Controller
      control={form.control}
      name="zoom_user_identifier"
      render={({ field, fieldState }) => (
        <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
          <Field.Label>
            Zoom attendance match
            <OptionalMark />
          </Field.Label>
<Input {...field} value={field.value ?? ""} />
<Field.Description>
            Same value Zoom returns on the participant report (often sign-in
            email, or user_id / participant id).
          </Field.Description>
                          <FormFieldErrorSlot message={fieldState.error?.message} />
        </Field.Root>
      )}
    />
  );
}

export function renderUserSectionFields(
  sectionId: string,
  context: UserFormFieldsContext
) {
  const measureClassName = fieldMeasureClassName(context.measure ?? "default");

  const wrap = (content: ReactNode) => (
    <div className={measureClassName}>{content}</div>
  );

  switch (sectionId) {
    case "identity":
      return wrap(
        <div className="space-y-6">
          <UserProfileFields {...context} />
          <UserAccessFields {...context} />
        </div>,
      );
    case "checkin":
      return wrap(<UserCheckinFields {...context} />);
    case "payroll":
      return wrap(<UserPayrollFields {...context} />);
    case "hr":
      return wrap(<UserHrFields {...context} />);
    case "zoom":
      return wrap(<UserZoomFields {...context} />);
    case "public_profile":
      return wrap(<UserPublicProfileFields {...context} />);
    default:
      return null;
  }
}
