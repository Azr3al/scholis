"use client";

import type { ComponentType, ReactNode } from "react";
import { z } from "zod";

import {
  Checkbox,
  Field,
  Radio,
  RadioGroup,
  Select,
  Switch,
  Textarea,
} from "@/components/primitives";
import { DatePicker } from "@/components/date/date-picker";
import { cn } from "@/lib/utils";
import { FieldLabelSuffix } from "@/components/form/required-mark";
import { fieldMeasureClassName, resolveFieldMeasure } from "@/lib/ui/field-measure";
import type { FieldMeasure } from "@/lib/ui/field-measure";

import {
  getBaseType,
  getZodEnumSelectOptions,
  isZodFieldRequired,
  resolveAutoFormLabel,
  zodToHtmlInputProps,
} from "./schema-utils";
import type {
  AutoFormFieldControlKind,
  AutoFormInputComponentProps,
  FieldConfigItem,
} from "./types";

const DEFAULT_ZOD_HANDLERS: Record<string, AutoFormFieldControlKind> = {
  ZodBoolean: "checkbox",
  ZodDate: "date",
  ZodEnum: "select",
  ZodNativeEnum: "select",
  ZodNumber: "number",
};

function AutoFormFieldParent({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function fieldRootClassName(
  fieldConfigItem: FieldConfigItem,
  formMeasure: FieldMeasure,
  groupMeasure?: FieldMeasure,
  extra?: string,
): string {
  const measure = resolveFieldMeasure(
    fieldConfigItem.measure ?? groupMeasure,
    formMeasure,
  );
  return cn(fieldMeasureClassName(measure), extra);
}

function AutoFormTextControl({
  label,
  isRequired,
  fieldConfigItem,
  fieldProps,
  error,
  className,
}: AutoFormInputComponentProps & { error?: string }) {
  const { value, onChange, onBlur, name, ref, ...rest } = fieldProps;
  return (
    <Field.Root className={className} name={name} invalid={Boolean(error)}>
      <Field.Label>
        {label}
        <FieldLabelSuffix required={isRequired} />
      </Field.Label>
      <Field.Control
        ref={ref}
        name={name}
        value={value ?? ""}
        onChange={onChange}
        onBlur={onBlur}
        {...rest}
      />
      {fieldConfigItem.description ? (
        <Field.Description>{fieldConfigItem.description}</Field.Description>
      ) : null}
      <div className="min-h-5">
        {error ? <Field.Error>{error}</Field.Error> : null}
      </div>
    </Field.Root>
  );
}

function AutoFormNumberControl({
  label,
  isRequired,
  fieldConfigItem,
  fieldProps,
  error,
  className,
}: AutoFormInputComponentProps & { error?: string }) {
  const { value, onChange, onBlur, name, ref, type: _t, ...rest } = fieldProps;
  return (
    <Field.Root className={className} name={name} invalid={Boolean(error)}>
      <Field.Label>
        {label}
        <FieldLabelSuffix required={isRequired} />
      </Field.Label>
      <Field.Control
        ref={ref}
        name={name}
        type="number"
        value={value ?? ""}
        onChange={onChange}
        onBlur={onBlur}
        {...rest}
      />
      {fieldConfigItem.description ? (
        <Field.Description>{fieldConfigItem.description}</Field.Description>
      ) : null}
      <div className="min-h-5">
        {error ? <Field.Error>{error}</Field.Error> : null}
      </div>
    </Field.Root>
  );
}

function AutoFormTextareaControl({
  label,
  isRequired,
  fieldConfigItem,
  fieldProps,
  error,
  className,
}: AutoFormInputComponentProps & { error?: string }) {
  const { value, onChange, onBlur, name, ref, ...rest } = fieldProps;
  return (
    <Field.Root className={className} name={name} invalid={Boolean(error)}>
      <Field.Label>
        {label}
        <FieldLabelSuffix required={isRequired} />
      </Field.Label>
      <Textarea
        ref={ref}
        name={name}
        value={value ?? ""}
        onChange={onChange}
        onBlur={onBlur}
        {...rest}
      />
      {fieldConfigItem.description ? (
        <Field.Description>{fieldConfigItem.description}</Field.Description>
      ) : null}
      <div className="min-h-5">
        {error ? <Field.Error>{error}</Field.Error> : null}
      </div>
    </Field.Root>
  );
}

function AutoFormCheckboxControl({
  label,
  isRequired,
  fieldConfigItem,
  fieldProps,
  error,
  className,
}: AutoFormInputComponentProps & { error?: string }) {
  const { value, onChange, onBlur, name, ref } = fieldProps;
  return (
    <Field.Root
      className={cn(className, "flex-row items-start gap-3")}
      name={name}
      invalid={Boolean(error)}
    >
      <Checkbox
        ref={ref}
        name={name}
        checked={Boolean(value)}
        onCheckedChange={(checked) => {
          onChange(checked === true);
          onBlur();
        }}
        onBlur={onBlur}
        className="mt-0.5 shrink-0 self-start"
      />
      <div className="flex flex-col gap-0.5">
        <Field.Label>
          {label}
          <FieldLabelSuffix required={isRequired} />
        </Field.Label>
        {fieldConfigItem.description ? (
          <Field.Description>{fieldConfigItem.description}</Field.Description>
        ) : null}
        <div className="min-h-5">
          {error ? <Field.Error>{error}</Field.Error> : null}
        </div>
      </div>
    </Field.Root>
  );
}

function AutoFormSwitchControl({
  label,
  isRequired,
  fieldConfigItem,
  fieldProps,
  error,
  className,
}: AutoFormInputComponentProps & { error?: string }) {
  const { value, onChange, onBlur, name, ref } = fieldProps;
  return (
    <Field.Root
      className={cn(
        className,
        "flex-row items-center justify-between gap-3",
      )}
      name={name}
      invalid={Boolean(error)}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Field.Label>
          {label}
          <FieldLabelSuffix required={isRequired} />
        </Field.Label>
        {fieldConfigItem.description ? (
          <Field.Description>{fieldConfigItem.description}</Field.Description>
        ) : null}
        <div className="min-h-5">
          {error ? <Field.Error>{error}</Field.Error> : null}
        </div>
      </div>
      <Switch
        ref={ref}
        className="shrink-0"
        name={name}
        checked={Boolean(value)}
        onCheckedChange={(checked) => {
          onChange(checked === true);
          onBlur();
        }}
        onBlur={onBlur}
      />
    </Field.Root>
  );
}

function AutoFormSelectControl({
  label,
  isRequired,
  fieldConfigItem,
  fieldProps,
  zodItem,
  error,
  className,
}: AutoFormInputComponentProps & { error?: string }) {
  const { value, onChange, onBlur, name } = fieldProps;
  const options = getZodEnumSelectOptions(
    zodItem,
    fieldConfigItem.enumOptionLabels,
  );
  const items = options.map((o) => ({
    value: o.valueStr,
    label: o.labelText,
  }));
  return (
    <Field.Root className={className} name={name} invalid={Boolean(error)}>
      <Field.Label>
        {label}
        <FieldLabelSuffix required={isRequired} />
      </Field.Label>
      <Select
        name={name}
        items={items}
        size="default"
        value={value == null || value === "" ? null : String(value)}
        onValueChange={(next) => {
          const match = options.find((o) => o.valueStr === next);
          onChange(match ? match.rawValue : next);
          onBlur();
        }}
        onOpenChange={(open) => {
          if (!open) onBlur();
        }}
      />
      {fieldConfigItem.description ? (
        <Field.Description>{fieldConfigItem.description}</Field.Description>
      ) : null}
      <div className="min-h-5">
        {error ? <Field.Error>{error}</Field.Error> : null}
      </div>
    </Field.Root>
  );
}

function AutoFormRadioControl({
  label,
  isRequired,
  fieldConfigItem,
  fieldProps,
  zodItem,
  error,
  className,
}: AutoFormInputComponentProps & { error?: string }) {
  const { value, onChange, onBlur, name } = fieldProps;
  const options = getZodEnumSelectOptions(
    zodItem,
    fieldConfigItem.enumOptionLabels,
  );
  return (
    <Field.Root className={className} name={name} invalid={Boolean(error)}>
      <Field.Label>
        {label}
        <FieldLabelSuffix required={isRequired} />
      </Field.Label>
      <RadioGroup
        name={name}
        value={value == null ? undefined : String(value)}
        onValueChange={(next) => {
          const match = options.find((o) => o.valueStr === next);
          onChange(match ? match.rawValue : next);
          onBlur();
        }}
      >
        {options.map((o) => (
          <label
            key={o.valueStr}
            className="flex items-center gap-2 text-sm text-text-primary"
          >
            <Radio value={o.valueStr} />
            {o.labelText}
          </label>
        ))}
      </RadioGroup>
      {fieldConfigItem.description ? (
        <Field.Description>{fieldConfigItem.description}</Field.Description>
      ) : null}
      <div className="min-h-5">
        {error ? <Field.Error>{error}</Field.Error> : null}
      </div>
    </Field.Root>
  );
}

function AutoFormDateControl({
  label,
  isRequired,
  fieldConfigItem,
  fieldProps,
  error,
  className,
}: AutoFormInputComponentProps & { error?: string }) {
  const { value, onChange, onBlur, name } = fieldProps;
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" && value
        ? new Date(`${value.slice(0, 10)}T00:00:00`)
        : undefined;
  return (
    <Field.Root className={className} name={name} invalid={Boolean(error)}>
      <Field.Label>
        {label}
        <FieldLabelSuffix required={isRequired} />
      </Field.Label>
      <DatePicker
        date={date && !Number.isNaN(date.getTime()) ? date : undefined}
        setDate={(next) => {
          onChange(next ?? null);
          onBlur?.();
        }}
      />
      {fieldConfigItem.description ? (
        <Field.Description>{fieldConfigItem.description}</Field.Description>
      ) : null}
      <div className="min-h-5">
        {error ? <Field.Error>{error}</Field.Error> : null}
      </div>
    </Field.Root>
  );
}

const INPUT_COMPONENTS: Record<
  AutoFormFieldControlKind,
  (props: AutoFormInputComponentProps & { error?: string }) => ReactNode
> = {
  checkbox: AutoFormCheckboxControl,
  date: AutoFormDateControl,
  select: AutoFormSelectControl,
  radio: AutoFormRadioControl,
  switch: AutoFormSwitchControl,
  textarea: AutoFormTextareaControl,
  number: AutoFormNumberControl,
  fallback: AutoFormTextControl,
};

export function resolveFieldControlKind(
  zodItem: z.ZodTypeAny,
  fieldConfigItem: FieldConfigItem,
): AutoFormFieldControlKind | React.FC<AutoFormInputComponentProps> {
  if (fieldConfigItem.fieldType) return fieldConfigItem.fieldType;
  const zodBaseType = getBaseType(zodItem);
  return DEFAULT_ZOD_HANDLERS[zodBaseType] ?? "fallback";
}

export function renderMappedFieldControl(args: {
  name: string;
  zodItem: z.ZodTypeAny;
  fieldConfigItem: FieldConfigItem;
  field: AutoFormInputComponentProps["field"];
  error?: string;
  isLoading?: boolean;
  formMeasure?: FieldMeasure;
  groupMeasure?: FieldMeasure;
}): ReactNode {
  const {
    name,
    zodItem,
    fieldConfigItem,
    field,
    error,
    isLoading,
    formMeasure = "default",
    groupMeasure,
  } = args;
  const label = resolveAutoFormLabel(
    name,
    zodItem,
    fieldConfigItem.customLabel,
  );
  const zodInputProps = zodToHtmlInputProps(zodItem);
  const isRequired =
    fieldConfigItem.inputProps?.required ?? isZodFieldRequired(zodItem);

  const inputType = resolveFieldControlKind(zodItem, fieldConfigItem);
  const InputComponent = (
    typeof inputType === "function"
      ? inputType
      : INPUT_COMPONENTS[inputType]
  ) as ComponentType<AutoFormInputComponentProps & { error?: string }>;

  const ParentElement = fieldConfigItem.renderParent ?? AutoFormFieldParent;

  const resolvedFieldClassName = fieldRootClassName(
    fieldConfigItem,
    formMeasure,
    groupMeasure,
  );

  return (
    <ParentElement>
      <div className={cn(isLoading && "pointer-events-none opacity-60")}>
        <InputComponent
          isLoading={isLoading}
          zodInputProps={zodInputProps}
          field={field}
          fieldConfigItem={fieldConfigItem}
          label={label}
          isRequired={isRequired}
          zodItem={zodItem}
          error={error}
          className={resolvedFieldClassName}
          fieldProps={{
            ...zodInputProps,
            ...field,
            ...fieldConfigItem.inputProps,
            value: !fieldConfigItem.inputProps?.defaultValue
              ? (field.value ?? "")
              : undefined,
          }}
        />
      </div>
    </ParentElement>
  );
}

export { DEFAULT_ZOD_HANDLERS, INPUT_COMPONENTS };
