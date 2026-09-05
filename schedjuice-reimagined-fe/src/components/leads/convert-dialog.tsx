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

import { useForm, Controller } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormFieldErrorSlot } from "@/components/form/field-error-slot";
import { OptionalMark, RequiredMark } from "@/components/form/required-mark";
import { scheduleScrollToFirstFormError } from "@/helpers/form";
import { convertLead, type StudentInput } from "@/lib/leads-api";
import { leadsKeys } from "@/hooks/leads/use-leads-board";
import type { Lead } from "@/types/lead";

export function ConvertDialog({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<StudentInput>({
    defaultValues: {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: StudentInput) => convertLead(lead.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.leads });
      toast.add({ title: "Lead converted to student" });
      onClose();
    },
    onError: () => {
      toast.add({ title: "Could not convert lead", type: "error" });
    },
  });

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
        <div>
          <Dialog.Title>Convert to student — {lead.name}</Dialog.Title>
        </div>
        <div {...form}>
          <form
            onSubmit={form.handleSubmit(
              (values) => mutation.mutate(values),
              () => scheduleScrollToFirstFormError(form),
            )}
            className="space-y-4"
          >
            <Controller
              control={form.control}
              name="name"
              rules={{ required: "Full name is required" }}
              render={({ field, fieldState }) => (
                <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
                  <Field.Label>
                    Full name
                    <RequiredMark />
                  </Field.Label>
                  <Input {...field} />
                  <FormFieldErrorSlot message={fieldState.error?.message} />
                </Field.Root>
              )}
            />
            <Controller
              control={form.control}
              name="email"
              rules={{ required: "Email is required" }}
              render={({ field, fieldState }) => (
                <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
                  <Field.Label>
                    Email
                    <RequiredMark />
                  </Field.Label>
                  <Input type="email" {...field} />
                  <Field.Description>Account login</Field.Description>
                  <FormFieldErrorSlot message={fieldState.error?.message} />
                </Field.Root>
              )}
            />
            <Controller
              control={form.control}
              name="phone"
              render={({ field, fieldState }) => (
                <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
                  <Field.Label>
                    Phone
                    <OptionalMark />
                  </Field.Label>
                  <Input {...field} />
                  <FormFieldErrorSlot message={fieldState.error?.message} />
                </Field.Root>
              )}
            />
            <p className="rounded-md bg-surface-hover px-3 py-2 text-xs text-text-muted">
              Creates a student account. Course enrollment is done separately.
            </p>
            <div>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" isLoading={mutation.isPending}>
                Convert
              </Button>
            </div>
          </form>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
