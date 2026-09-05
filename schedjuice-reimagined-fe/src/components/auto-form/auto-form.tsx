"use client";

import { useCallback } from "react";
import { FormProvider, useFormState, type Control } from "react-hook-form";

import { Button } from "@/components/primitives";
import { FormSaveTick } from "@/components/edit-kit";
import { AutosaveProvider } from "@/components/form/autosave-context";
import {
  handleNativeFormInvalid,
  scheduleScrollToFirstFormError,
} from "@/helpers/form";
import { cn } from "@/lib/utils";

import { AutoFormGroupSection } from "./auto-form-group";
import { AutoFormSkeleton } from "./auto-form-skeleton";
import { useAutoForm } from "./use-auto-form";
import type { AutoFormProps } from "./types";

function AutoFormRootError({ control }: { control: Control<any> }) {
  const { errors } = useFormState({ control });
  const message = errors.root?.message;
  if (!message) return null;

  return (
    <div
      data-form-root-error
      className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      role="alert"
    >
      <p>{String(message)}</p>
    </div>
  );
}

export function AutoForm({
  schema,
  saveMode,
  groups,
  fieldConfig,
  form: externalForm,
  defaultValues,
  values,
  onSubmit,
  onCancel,
  isLoading,
  className,
  measure = "default",
  formId,
  children,
  units,
  shouldAutosaveField,
  onAutosave,
  autosaveQueryKey,
  stickyFooter = saveMode === "create",
  submitLabel = "Submit",
  cancelLabel = "Cancel",
  isSubmitting,
}: AutoFormProps) {
  const {
    form,
    autosave,
    autosaveEnabled,
    bindFieldBlur,
    objectSchema,
  } = useAutoForm({
    schema,
    saveMode,
    form: externalForm,
    defaultValues,
    values,
    units,
    shouldAutosaveField,
    onAutosave,
    autosaveQueryKey,
    fieldConfig,
  });

  const handleSubmit = useCallback(
    (data: Record<string, unknown>) => {
      onSubmit?.(data);
    },
    [onSubmit],
  );

  const onInvalid = useCallback(() => {
    scheduleScrollToFirstFormError(form);
  }, [form]);

  if (isLoading) {
    return (
      <AutoFormSkeleton
        groups={groups}
        saveMode={saveMode}
        className={className}
      />
    );
  }

  const showSavedTick = autosaveEnabled && autosave.status === "saved";

  const formBody = (
    <FormProvider {...form}>
      <form
        id={formId}
        onSubmit={(e) => {
          if (saveMode === "edit" && autosaveEnabled) {
            // Edit autosave owns persistence; block accidental full submits.
            e.preventDefault();
            return;
          }
          form.handleSubmit(handleSubmit, onInvalid)(e);
        }}
        onInvalidCapture={handleNativeFormInvalid}
        className={cn("w-full", className)}
        data-slot="auto-form"
        data-save-mode={saveMode}
      >
        {/* Reserved slot — no layout shift when FormSaveTick appears (DESIGN.md §12). */}
        {saveMode === "edit" ? (
          <div
            className="mb-4 flex min-h-5 items-center"
            data-slot="auto-form-save-tick"
          >
            <FormSaveTick visible={showSavedTick} />
          </div>
        ) : null}

        <AutoFormRootError control={form.control} />

        <div className="flex w-full flex-col gap-8">
          {groups.map((group) => (
            <AutoFormGroupSection
              key={group.id}
              group={group}
              shape={objectSchema.shape}
              fieldConfig={fieldConfig}
              isLoading={saveMode === "create" ? isSubmitting : undefined}
              formMeasure={measure}
              onFieldBlur={autosaveEnabled ? bindFieldBlur : undefined}
            />
          ))}
        </div>

        {children}

        {saveMode === "create" && stickyFooter ? (
          <div
            className={cn(
              "sticky bottom-0 z-10 mt-6 flex min-h-10 items-center gap-3",
              "border-t border-border bg-surface/95 py-3 backdrop-blur-sm",
            )}
            data-slot="auto-form-create-footer"
          >
            <Button type="submit" isLoading={isSubmitting}>
              {submitLabel}
            </Button>
            {onCancel ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                {cancelLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </form>
    </FormProvider>
  );

  // Restore GlobalAutosaveStatus (saving / error / retry) for edit autosave.
  if (autosaveEnabled) {
    return <AutosaveProvider value={autosave}>{formBody}</AutosaveProvider>;
  }

  return formBody;
}

export default AutoForm;
