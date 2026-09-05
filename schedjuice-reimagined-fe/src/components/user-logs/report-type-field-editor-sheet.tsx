"use client";
import { Button, Input, Sheet, Switch, Field } from "@/components/primitives";

import { ChoicesEditor } from "@/components/custom-fields/designer/choices-editor";
import { FieldTypeGrid } from "@/components/custom-fields/designer/field-type-grid";
import {
  handleNativeFormInvalid,
  scheduleScrollToFirstFormError,
} from "@/helpers/form";
import { slugifyKey } from "@/lib/custom-fields/definition-defaults";
import {
  reportTypeFieldEditorSchema,
  type DraftReportTypeField,
} from "@/lib/user-logs/report-type-field-validation";
import type { ReportFieldType } from "@/types/user-log";
import { zodResolver } from "@hookform/resolvers/zod";
import { Book as BookOpen, NavArrowDown as ChevronDown, User } from "iconoir-react";
import { useEffect, useRef } from "react";
import { FormProvider, Controller, useForm } from "react-hook-form";
import type * as z from "zod";

const REPORT_FK_TYPES = [
  { value: "staff_user_fk", label: "Staff user", icon: User },
  { value: "course_fk", label: "Course", icon: BookOpen },
] as const;

type EditorValues = z.infer<typeof reportTypeFieldEditorSchema>;

function valuesFromField(field: DraftReportTypeField | null): EditorValues {
  if (!field) {
    return {
      field_label: "New field",
      field_key: "new_field",
      field_type: "text",
      is_required: false,
      choices: [],
    };
  }
  return {
    field_label: field.field_label,
    field_key: field.field_key,
    field_type: field.field_type,
    is_required: field.is_required,
    choices: field.choices ?? [],
  };
}

export function ReportTypeFieldEditorSheet({
  open,
  onOpenChange,
  editing,
  sortOrder,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: DraftReportTypeField | null;
  sortOrder: number;
  onSave: (field: DraftReportTypeField) => void;
}) {
  const isEditing = Boolean(editing);
  const keyDirty = useRef(false);

  const form = useForm<EditorValues>({
    resolver: zodResolver(reportTypeFieldEditorSchema),
    defaultValues: valuesFromField(editing),
  });

  useEffect(() => {
    if (open) {
      form.reset(valuesFromField(editing));
      keyDirty.current = Boolean(editing);
    }
  }, [open, editing, form]);

  const fieldType = form.watch("field_type");
  const showsChoices = fieldType === "choice" || fieldType === "multichoice";

  const onSubmit = form.handleSubmit(
    (v) => {
      const choices =
        v.field_type === "choice" || v.field_type === "multichoice"
          ? v.choices
          : null;
      onSave({
        field_key: v.field_key,
        field_label: v.field_label,
        field_type: v.field_type as ReportFieldType,
        is_required: v.is_required,
        choices,
        sort_order: editing?.sort_order ?? sortOrder,
      });
      onOpenChange(false);
    },
    () => scheduleScrollToFirstFormError(form),
  );

  return (
    <Sheet.Root open={open} onOpenChange={onOpenChange}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border-l-0 p-0 sm:max-w-none md:w-[720px] lg:w-[820px]"
      >
        <div className="space-y-1 border-b px-6 py-5 pr-12 text-left">
          <Sheet.Title>{isEditing ? "Edit field" : "Add field"}</Sheet.Title>
          <Sheet.Description className="text-sm text-text-secondary">
            Configure what staff fill in when logging this report type.
          </Sheet.Description>
        </div>

        <FormProvider {...form}>
          <form
            onSubmit={onSubmit}
            onInvalidCapture={handleNativeFormInvalid}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <Controller
                control={form.control}
                name="field_label"
                render={({ field, fieldState }) => (
                  <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
                    <Field.Label>Label</Field.Label>
<Input
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          if (!keyDirty.current && !isEditing) {
                            form.setValue(
                              "field_key",
                              slugifyKey(e.target.value),
                            );
                          }
                        }}
                      />
                <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
                  </Field.Root>
                )}
              />

              <div className="space-y-2">
                <label>Type</label>
                <FieldTypeGrid
                  value={fieldType}
                  extraTypes={REPORT_FK_TYPES}
                  disabled={isEditing}
                  onChange={(v) => {
                    form.setValue("field_type", v, { shouldDirty: true });
                    if (v === "choice" || v === "multichoice") {
                      const current = form.getValues("choices");
                      if (current.length === 0) {
                        form.setValue("choices", [{ value: "", label: "" }]);
                      }
                    } else {
                      form.setValue("choices", []);
                    }
                  }}
                />
                {isEditing ? (
                  <p className="text-xs text-muted-foreground">
                    The type is fixed after a field is created.
                  </p>
                ) : null}
              </div>

              <Controller
                control={form.control}
                name="is_required"
                render={({ field, fieldState }) => (
                  <Field.Root className="flex items-center gap-2" name={field.name} invalid={Boolean(fieldState.error)}>
<Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
<Field.Label className="mt-0!">Required</Field.Label>
                  </Field.Root>
                )}
              />

              {showsChoices ? (
                <Controller
                  control={form.control}
                  name="choices"
                  render={({ field, fieldState }) => (
                    <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
<ChoicesEditor
                          value={field.value}
                          onChange={field.onChange}
                        />
                <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
                    </Field.Root>
                  )}
                />
              ) : null}

              <details>
                <summary className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <ChevronDown className="h-4 w-4" />
                  Advanced
                </summary>
                <div className="pt-3">
                  <Controller
                    control={form.control}
                    name="field_key"
                    render={({ field, fieldState }) => (
                      <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
                        <Field.Label>Field key</Field.Label>
<Input
                            {...field}
                            className="font-mono"
                            onChange={(e) => {
                              keyDirty.current = true;
                              field.onChange(e);
                            }}
                          />
<Field.Description>
                          Used in stored data, not shown to people filling the
                          form.
                        </Field.Description>
                                        <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
                      </Field.Root>
                    )}
                  />
                </div>
              </details>
            </div>

            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save field</Button>
            </div>
          </form>
        </FormProvider>
        </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
