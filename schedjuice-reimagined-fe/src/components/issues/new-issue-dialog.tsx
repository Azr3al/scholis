"use client";
import {
  Button,
  Dialog,
  Field,
  Input,
  Textarea,
  useToast,
} from "@/components/primitives";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import EntityCombobox from "@/components/form/entity-combobox";
import { FormFieldErrorSlot } from "@/components/form/field-error-slot";
import { OptionalMark, RequiredMark } from "@/components/form/required-mark";
import { queryParamDefault } from "@/config/defaults";
import { listToApiArray } from "@/helpers/filter-params";
import { scheduleScrollToFirstFormError } from "@/helpers/form";
import { createIssue, type CreateIssueInput } from "@/lib/issues-api";
import { formatUserComboboxSearchText } from "@/lib/users/user-combobox-search";
import { issuesKeys } from "@/hooks/issues/use-issues-board";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";

type NewIssueFormValues = {
  title: string;
  description: string;
  related_student: string;
  related_course: string;
};

const DEFAULT_VALUES: NewIssueFormValues = {
  title: "",
  description: "",
  related_student: "",
  related_course: "",
};

export function NewIssueDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const form = useForm<NewIssueFormValues>({ defaultValues: DEFAULT_VALUES });

  const mutation = useMutation({
    mutationFn: (input: CreateIssueInput) => createIssue(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: issuesKeys.issuesListRoot });
      toast.add({ title: "Issue created" });
      form.reset(DEFAULT_VALUES);
      onOpenChange(false);
    },
    onError: () => {
      toast.add({ title: "Could not create issue", type: "error" });
    },
  });

  function onSubmit(values: NewIssueFormValues) {
    mutation.mutate({
      title: values.title,
      description: values.description || undefined,
      related_student: values.related_student
        ? Number(values.related_student)
        : null,
      related_course: values.related_course
        ? Number(values.related_course)
        : null,
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <div>
            <Dialog.Title>New issue</Dialog.Title>
          </div>
          <div {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit, () =>
                scheduleScrollToFirstFormError(form),
              )}
              className="space-y-4"
            >
              <Controller
                control={form.control}
                name="title"
                rules={{ required: "Title is required" }}
                render={({ field, fieldState }) => (
                  <Field.Root
                    name={field.name}
                    invalid={Boolean(fieldState.error)}
                  >
                    <Field.Label>
                      Title
                      <RequiredMark />
                    </Field.Label>
                    <Input {...field} autoFocus />
                    <FormFieldErrorSlot message={fieldState.error?.message} />
                  </Field.Root>
                )}
              />
              <Controller
                control={form.control}
                name="description"
                render={({ field, fieldState }) => (
                  <Field.Root
                    name={field.name}
                    invalid={Boolean(fieldState.error)}
                  >
                    <Field.Label>
                      Description
                      <OptionalMark />
                    </Field.Label>
                    <Textarea
                      {...field}
                      placeholder="What's going on?"
                      className="min-h-[88px]"
                    />
                    <FormFieldErrorSlot message={fieldState.error?.message} />
                  </Field.Root>
                )}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Controller
                  control={form.control}
                  name="related_student"
                  render={({ field, fieldState }) => (
                    <Field.Root
                      name={field.name}
                      invalid={Boolean(fieldState.error)}
                    >
                      <Field.Label>
                        Related student
                        <OptionalMark />
                      </Field.Label>
                      <EntityCombobox
                        label=""
                        entity="users"
                        displayFunction={(u) => u.name || u.email}
                        searchFunction={formatUserComboboxSearchText}
                        value={field.value}
                        onChange={field.onChange}
                        emptyOption={{ value: "", label: "No student" }}
                        comboboxPlaceholder="Search by name, alt name, or email"
                        queryParams={{
                          ...queryParamDefault,
                          sorts: ["name"],
                          fields: ["id", "name", "email", "alternative_name"],
                          size: -1,
                        }}
                        filterParams={{
                          filter_params: [
                            {
                              field_name: "roles",
                              operator: operatorEnum.contains,
                              value: listToApiArray([role.student]),
                            },
                          ],
                        }}
                      />
                      <FormFieldErrorSlot message={fieldState.error?.message} />
                    </Field.Root>
                  )}
                />
                <Controller
                  control={form.control}
                  name="related_course"
                  render={({ field, fieldState }) => (
                    <Field.Root
                      name={field.name}
                      invalid={Boolean(fieldState.error)}
                    >
                      <Field.Label>
                        Related course
                        <OptionalMark />
                      </Field.Label>
                      <EntityCombobox
                        label=""
                        entity="courses"
                        displayFunction={(c) => c.title}
                        value={field.value}
                        onChange={field.onChange}
                        emptyOption={{ value: "", label: "No course" }}
                        comboboxPlaceholder="All courses"
                        queryParams={{ fields: ["id", "title"], sorts: ["title"] }}
                      />
                      <FormFieldErrorSlot message={fieldState.error?.message} />
                    </Field.Root>
                  )}
                />
              </div>
              <p className="text-xs text-text-muted">
                You&apos;ll be set as the assignee and an observer. Reassign it from the
                issue detail once it&apos;s created.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={mutation.isPending}>
                  Create
                </Button>
              </div>
            </form>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
