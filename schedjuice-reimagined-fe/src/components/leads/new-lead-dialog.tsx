"use client";
import {
  Button,
  Dialog,
  Field,
  Input,
  buttonVariants,
  inputClassName,
  useToast,
} from "@/components/primitives";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormFieldErrorSlot } from "@/components/form/field-error-slot";
import { OptionalMark, RequiredMark } from "@/components/form/required-mark";
import Selector from "@/components/form/selectors/selector";
import { scheduleScrollToFirstFormError } from "@/helpers/form";
import {
  createLead,
  findDuplicateLeads,
  type CreateLeadInput,
} from "@/lib/leads-api";
import { leadsKeys } from "@/hooks/leads/use-leads-board";
import type { Lead, LeadSource, LeadStatus } from "@/types/lead";

export function NewLeadDialog({
  open,
  onOpenChange,
  statuses,
  sources,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  statuses: LeadStatus[];
  sources: LeadSource[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dupes, setDupes] = useState<Lead[]>([]);
  const defaultStatus = statuses.find((status) => status.is_default) ?? statuses[0];
  const defaultSourceId = sources[0]?.id;

  const form = useForm<CreateLeadInput>({
    defaultValues: {
      name: "",
      source: defaultSourceId,
      phone: "",
      email: "",
      facebook_link: "",
      interested_in: "",
    },
  });

  useEffect(() => {
    if (open && defaultSourceId) {
      form.setValue("source", defaultSourceId);
    }
  }, [open, defaultSourceId, form]);

  const mutation = useMutation({
    mutationFn: (input: CreateLeadInput) => createLead(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.leads });
      toast.add({ title: "Lead created" });
      form.reset({
        name: "",
        source: defaultSourceId,
        phone: "",
        email: "",
        facebook_link: "",
        interested_in: "",
      });
      setDupes([]);
      onOpenChange(false);
    },
    onError: () => {
      toast.add({ title: "Could not create lead", type: "error" });
    },
  });

  async function checkDupes() {
    const phone = form.getValues("phone");
    const email = form.getValues("email");
    const facebook_link = form.getValues("facebook_link");
    const found = await findDuplicateLeads({ phone, email, facebook_link });
    setDupes(found);
  }

  function onSubmit(values: CreateLeadInput) {
    mutation.mutate({
      ...values,
      source: Number(values.source),
      status: defaultStatus?.id,
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
        <div>
          <Dialog.Title>New lead</Dialog.Title>
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
              name="name"
              rules={{ required: "Name is required" }}
              render={({ field, fieldState }) => (
                <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
                  <Field.Label>
                    Name
                    <RequiredMark />
                  </Field.Label>
                  <Input {...field} />
                  <FormFieldErrorSlot message={fieldState.error?.message} />
                </Field.Root>
              )}
            />
            <Controller
              control={form.control}
              name="source"
              rules={{ required: "Source is required" }}
              render={({ field, fieldState }) => (
                <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
                  <Field.Label>
                    Source
                    <RequiredMark />
                  </Field.Label>
                  <Selector
                    fullWidth
                    showOnlyInlineLable
                    className="w-full min-w-0"
                    options={sources.map((source) => ({
                      label: source.name,
                      value: String(source.id),
                    }))}
                    value={field.value ? String(field.value) : undefined}
                    onChange={(value) => field.onChange(Number(value))}
                  />
                  <FormFieldErrorSlot message={fieldState.error?.message} />
                </Field.Root>
              )}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Controller
                control={form.control}
                name="phone"
                render={({ field, fieldState }) => (
                  <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
                    <Field.Label>
                      Phone
                      <OptionalMark />
                    </Field.Label>
                    <Input
                      {...field}
                      onBlur={() => {
                        field.onBlur();
                        void checkDupes();
                      }}
                    />
                    <FormFieldErrorSlot message={fieldState.error?.message} />
                  </Field.Root>
                )}
              />
              <Controller
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
                    <Field.Label>
                      Email
                      <OptionalMark />
                    </Field.Label>
                    <Input
                      {...field}
                      type="email"
                      onBlur={() => {
                        field.onBlur();
                        void checkDupes();
                      }}
                    />
                    <FormFieldErrorSlot message={fieldState.error?.message} />
                  </Field.Root>
                )}
              />
            </div>
            <Controller
              control={form.control}
              name="facebook_link"
              render={({ field, fieldState }) => (
                <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
                  <Field.Label>
                    Facebook link
                    <OptionalMark />
                  </Field.Label>
                  <Input
                    {...field}
                    onBlur={() => {
                      field.onBlur();
                      void checkDupes();
                    }}
                  />
                  <FormFieldErrorSlot message={fieldState.error?.message} />
                </Field.Root>
              )}
            />
            <Controller
              control={form.control}
              name="interested_in"
              render={({ field, fieldState }) => (
                <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
                  <Field.Label>
                    Interested in
                    <OptionalMark />
                  </Field.Label>
                  <Input {...field} />
                  <FormFieldErrorSlot message={fieldState.error?.message} />
                </Field.Root>
              )}
            />
            {dupes.length > 0 && (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                {dupes.length} existing lead(s) match this contact:{" "}
                {dupes.map((lead) => lead.name).join(", ")}. You can still create
                this lead.
              </p>
            )}
            <div>
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
